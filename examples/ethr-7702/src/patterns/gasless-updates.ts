// src/patterns/gasless-updates.ts
// Pattern 2: Gasless/Sponsored DID update via EIP-7702
//
// The EOA signs a 7702 authorization tuple (off-chain).
// A broadcaster sends the type-4 tx and pays gas.
// The EOA's DID document is updated without the EOA holding ETH.

import { type WalletClient, type PublicClient, encodeFunctionData, toHex, type Hash } from 'viem'
import { DID_MANAGER_ABI } from '../utils/abis.js'

export type GaslessUpdateParams = {
  registry: `0x${string}`
  didManagerAddress: `0x${string}`
  attrName: `0x${string}` // bytes32
  attrValue: Uint8Array | `0x${string}`
  validity: bigint
}

/**
 * Performs a gasless DID attribute update.
 *
 * @param eoaWalletClient  - The EOA whose DID document is being updated. Signs the 7702 auth only.
 * @param broadcasterWalletClient - The broadcaster that pays gas and sends the tx.
 * @param publicClient     - Read-only client.
 * @param params           - Registry, DIDManager address, attribute details.
 * @returns tx hash
 */
export async function gaslessDidUpdate(
  eoaWalletClient: WalletClient,
  broadcasterWalletClient: WalletClient,
  publicClient: PublicClient,
  params: GaslessUpdateParams
): Promise<Hash> {
  const { registry, didManagerAddress, attrName, attrValue, validity } = params
  const eoaAddress = eoaWalletClient.account!.address

  // 1. EOA signs the 7702 authorization — designates the broadcaster as the executor
  const broadcasterAddress = broadcasterWalletClient.account!.address
  const authorization = await eoaWalletClient.signAuthorization({
    contractAddress: didManagerAddress,
    executor: broadcasterAddress,
    account: eoaWalletClient.account!,
  })

  // 2. Encode the call targeting the EOA's identity
  const valueHex = attrValue instanceof Uint8Array ? toHex(attrValue) : attrValue
  const data = encodeFunctionData({
    abi: DID_MANAGER_ABI,
    functionName: 'setAttributeForIdentity',
    args: [registry, attrName, valueHex, validity],
  })

  // 3. Broadcaster sends the type-4 tx — calls the EOA, pays gas
  const hash = await broadcasterWalletClient.sendTransaction({
    authorizationList: [authorization],
    to: eoaAddress,
    data,
    chain: broadcasterWalletClient.chain,
    account: broadcasterWalletClient.account!,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') throw new Error(`gaslessDidUpdate reverted (txHash: ${hash})`)

  return hash
}

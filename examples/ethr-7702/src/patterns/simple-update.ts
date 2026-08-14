// src/patterns/simple-update.ts
// Pattern 0: Simple EOA DID update via EIP-7702 delegation
//
// Gasless: the EOA signs the 7702 authorization off-chain; a broadcaster sends
// the type-4 tx (delegation + setAttributeForIdentity) and pays all gas. The
// EOA needs zero ETH.

import { type WalletClient, type PublicClient, encodeFunctionData, toHex, type Hash } from 'viem'
import { DID_MANAGER_ABI } from '../utils/abis.js'

export type SimpleUpdateParams = {
  registry: `0x${string}`
  didManagerAddress: `0x${string}`
  attrName: `0x${string}` // bytes32
  attrValue: Uint8Array | `0x${string}`
  validity: bigint
}

/**
 * Performs a gasless DID attribute update via DIDManager7702 delegation.
 *
 * @param signerWallet - The EOA whose DID document is updated. Signs the 7702 auth only.
 * @param broadcasterWallet - Pays gas and broadcasts the type-4 tx (any funded key/wallet).
 * @param publicClient - Read-only client.
 * @param params - Registry, DIDManager address, attribute details.
 * @returns tx hash
 */
export async function simpleDidUpdate(
  signerWallet: WalletClient,
  broadcasterWallet: WalletClient,
  publicClient: PublicClient,
  params: SimpleUpdateParams
): Promise<Hash> {
  const { registry, didManagerAddress, attrName, attrValue, validity } = params
  const eoaAddress = signerWallet.account!.address
  const broadcasterAddress = broadcasterWallet.account!.address

  // 1. Sign the 7702 authorization — EOA delegates to DIDManager7702.
  //    executor: the broadcaster address, so viem does NOT inflate the EOA nonce
  //    (the broadcaster, not the EOA, sends this tx).
  const authorization = await signerWallet.signAuthorization({
    contractAddress: didManagerAddress,
    executor: broadcasterAddress,
    account: signerWallet.account!,
  })

  // 2. Encode the call to setAttributeForIdentity
  const valueHex = attrValue instanceof Uint8Array ? toHex(attrValue) : attrValue
  const data = encodeFunctionData({
    abi: DID_MANAGER_ABI,
    functionName: 'setAttributeForIdentity',
    args: [registry, attrName, valueHex, validity],
  })

  // 3. Broadcaster sends type-4 transaction: delegation + call in one tx
  const hash = await broadcasterWallet.sendTransaction({
    authorizationList: [authorization],
    to: eoaAddress, // call the EOA itself — triggers delegated code
    data,
    chain: broadcasterWallet.chain,
    account: broadcasterWallet.account!,
  })

  // 4. Wait for receipt
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') throw new Error(`simpleDidUpdate reverted (txHash: ${hash})`)

  return hash
}

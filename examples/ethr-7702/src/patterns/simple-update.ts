// src/patterns/simple-update.ts
// Pattern 0: Simple EOA DID update via EIP-7702 delegation

import { type WalletClient, type PublicClient, encodeFunctionData, toHex, type Hash } from 'viem'
import { DID_MANAGER_ABI } from '../utils/abis.js'

export type SimpleUpdateParams = {
  registry: `0x${string}`
  didManagerAddress: `0x${string}`
  attrName: `0x${string}` // bytes32
  attrValue: Uint8Array | `0x${string}`
  validity: bigint
}

export async function simpleDidUpdate(
  eoaWalletClient: WalletClient,
  publicClient: PublicClient,
  params: SimpleUpdateParams
): Promise<Hash> {
  const { registry, didManagerAddress, attrName, attrValue, validity } = params
  const eoaAddress = eoaWalletClient.account!.address

  // 1. Sign the 7702 authorization — EOA delegates to DIDManager7702
  //    executor: 'self' means the EOA is also the tx sender (handles nonce offset)
  const authorization = await eoaWalletClient.signAuthorization({
    contractAddress: didManagerAddress,
    executor: 'self',
  })

  // 2. Encode the call to setAttributeForIdentity
  //    viem's encodeFunctionData requires bytes params as hex strings, not Uint8Array
  const valueHex = attrValue instanceof Uint8Array ? toHex(attrValue) : attrValue
  const data = encodeFunctionData({
    abi: DID_MANAGER_ABI,
    functionName: 'setAttributeForIdentity',
    args: [registry, attrName, valueHex, validity],
  })

  // 3. Send type-4 transaction: delegation + call in one tx
  const hash = await eoaWalletClient.sendTransaction({
    authorizationList: [authorization],
    to: eoaAddress, // call the EOA itself — triggers delegated code
    data,
    chain: eoaWalletClient.chain,
    account: eoaWalletClient.account!,
  })

  // 4. Wait for receipt
  await publicClient.waitForTransactionReceipt({ hash })

  return hash
}

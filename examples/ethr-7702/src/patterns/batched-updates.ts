// src/patterns/batched-updates.ts
// Pattern 1: Batched DID attribute updates via EIP-7702 delegation
//
// One EIP-7702 authorization + one type-4 tx sets N DID attributes atomically.
// Gas-efficient vs N separate transactions; all-or-nothing semantics.

import { type WalletClient, type PublicClient, encodeFunctionData, toHex, type Hash } from 'viem'
import { DID_MANAGER_ABI } from '../utils/abis.js'

export type AttributeUpdate = {
  name: `0x${string}` // bytes32
  value: Uint8Array | `0x${string}`
  validity: bigint
}

export type BatchedUpdateParams = {
  registry: `0x${string}`
  didManagerAddress: `0x${string}`
  updates: AttributeUpdate[]
}

export async function batchedDidUpdates(
  eoaWalletClient: WalletClient,
  publicClient: PublicClient,
  params: BatchedUpdateParams
): Promise<Hash> {
  const { registry, didManagerAddress, updates } = params
  const eoaAddress = eoaWalletClient.account!.address

  if (updates.length === 0) throw new Error('updates must be non-empty')

  // 1. Sign a single EIP-7702 authorization
  const authorization = await eoaWalletClient.signAuthorization({
    contractAddress: didManagerAddress,
    executor: 'self',
  })

  // 2. Encode the batch call — convert any Uint8Array values to hex
  const encodedUpdates = updates.map((u) => ({
    name: u.name,
    value: u.value instanceof Uint8Array ? toHex(u.value) : u.value,
    validity: u.validity,
  }))

  const data = encodeFunctionData({
    abi: DID_MANAGER_ABI,
    functionName: 'setBatchAttributesForIdentity',
    args: [registry, encodedUpdates],
  })

  // 3. One type-4 tx: delegation + batch call
  const hash = await eoaWalletClient.sendTransaction({
    authorizationList: [authorization],
    to: eoaAddress,
    data,
    chain: eoaWalletClient.chain,
    account: eoaWalletClient.account!,
  })

  await publicClient.waitForTransactionReceipt({ hash })

  return hash
}

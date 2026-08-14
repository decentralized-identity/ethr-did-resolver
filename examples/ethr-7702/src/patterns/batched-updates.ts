// src/patterns/batched-updates.ts
// Pattern 1: Batched DID attribute updates via EIP-7702 delegation
//
// One EIP-7702 authorization + one type-4 tx sets N DID attributes atomically.
// Gasless: the EOA signs the auth off-chain; a broadcaster sends the type-4 tx
// and pays all gas. Gas-efficient vs N separate transactions; all-or-nothing.

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

/**
 * Performs a gasless batched DID attribute update via DIDManager7702 delegation.
 *
 * @param signerWallet - The EOA whose DID document is updated. Signs the 7702 auth only.
 * @param broadcasterWallet - Pays gas and broadcasts the type-4 tx (any funded key/wallet).
 * @param publicClient - Read-only client.
 * @param params - Registry, DIDManager address, attribute updates.
 * @returns tx hash
 */
export async function batchedDidUpdates(
  signerWallet: WalletClient,
  broadcasterWallet: WalletClient,
  publicClient: PublicClient,
  params: BatchedUpdateParams
): Promise<Hash> {
  const { registry, didManagerAddress, updates } = params
  const eoaAddress = signerWallet.account!.address
  const broadcasterAddress = broadcasterWallet.account!.address

  if (updates.length === 0) throw new Error('updates must be non-empty')

  // 1. Sign a single EIP-7702 authorization (executor: the broadcaster)
  const authorization = await signerWallet.signAuthorization({
    contractAddress: didManagerAddress,
    executor: broadcasterAddress,
    account: signerWallet.account!,
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

  // 3. Broadcaster sends one type-4 tx: delegation + batch call
  const hash = await broadcasterWallet.sendTransaction({
    authorizationList: [authorization],
    to: eoaAddress,
    data,
    chain: broadcasterWallet.chain,
    account: broadcasterWallet.account!,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') throw new Error(`batchedDidUpdates reverted (txHash: ${hash})`)

  return hash
}

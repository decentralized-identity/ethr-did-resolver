// src/utils/storage.ts
// Shared reader for the ERC-7201-style namespaced storage that the delegation
// managers use. Their state lives on the delegating EOA at
//   slot(keccak256("ethr-7702.<ManagerName>")) + offset
// and must be read via getStorageAt because it is addressable before the EOA has
// any delegated code (and therefore has no view functions to call).

import { type PublicClient, keccak256, toBytes, toHex } from 'viem'

/** ERC-7201-style namespace base for a manager's state in EOA storage. Must match
 *  the keccak256 strings in contracts/*.sol. */
export function managerStorageBase(managerName: string): bigint {
  return BigInt(keccak256(toBytes(`ethr-7702.${managerName}`)))
}

/** Read a field at `offset` within a manager's namespaced storage region on `address`. */
export async function readNamespacedField(
  publicClient: PublicClient,
  address: `0x${string}`,
  managerName: string,
  offset: number
): Promise<bigint> {
  const raw = await publicClient.getStorageAt({
    address,
    slot: toHex(managerStorageBase(managerName) + BigInt(offset)),
  })
  return raw === null ? 0n : BigInt(raw as `0x${string}`)
}

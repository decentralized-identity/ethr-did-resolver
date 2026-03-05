// src/patterns/revocation.ts
// Pattern 6: Revocation registry integration via EIP-7702
//
// The EOA delegates to RevocationDIDManager7702, which provides:
//   - setAttributeForIdentity: add DID attributes (same as Pattern 0)
//   - revokeAttributeForIdentity: call ERC-1056 revokeAttribute (sets validTo=0)
//   - revokeCredential: write a boolean revocation flag in EOA storage keyed by credentialId
//   - isRevoked: read the revocation flag (verifiers check this on-chain)
//
// Flow:
//   1. EOA signs 7702 auth + delegates (no extra config step needed)
//   2. EOA calls setAttributeForIdentity to add a key
//   3. EOA calls revokeAttributeForIdentity to signal ERC-1056 expiry
//   4. EOA calls revokeCredential(credentialId) to record credential revocation
//   5. Anyone calls isRevoked(credentialId) on the EOA address to check status

import {
  type WalletClient,
  type PublicClient,
  encodeFunctionData,
  toHex,
  keccak256,
  type Hash,
} from 'viem'
import { REVOCATION_DID_MANAGER_ABI } from '../utils/abis.js'

export type RevocationDelegateParams = {
  revocationDidManagerAddress: `0x${string}`
}

/**
 * Step 1: EOA delegates to RevocationDIDManager7702 and adds an initial DID attribute.
 * Combining delegation + first action in one tx avoids the Anvil gas estimation issue
 * with no-op 0x calls on accounts with nonce=0.
 */
export async function setupRevocationDelegation(
  eoaWalletClient: WalletClient,
  publicClient: PublicClient,
  params: RevocationDelegateParams & {
    registry: `0x${string}`
    attrName: `0x${string}`
    attrValue: Uint8Array | `0x${string}`
    validity: bigint
  }
): Promise<Hash> {
  const { revocationDidManagerAddress, registry, attrName, attrValue, validity } = params
  const eoaAddress = eoaWalletClient.account!.address
  const valueHex = attrValue instanceof Uint8Array ? toHex(attrValue) : attrValue

  const authorization = await eoaWalletClient.signAuthorization({
    contractAddress: revocationDidManagerAddress,
    executor: 'self',
  })

  // Combine delegation + first setAttribute in one tx
  const data = encodeFunctionData({
    abi: REVOCATION_DID_MANAGER_ABI,
    functionName: 'setAttributeForIdentity',
    args: [registry, attrName, valueHex, validity],
  })

  const hash = await eoaWalletClient.sendTransaction({
    authorizationList: [authorization],
    to: eoaAddress,
    data,
    gas: 200_000n,
    chain: eoaWalletClient.chain,
    account: eoaWalletClient.account!,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') {
    throw new Error(`setupRevocationDelegation reverted (txHash: ${hash})`)
  }
  return hash
}

/**
 * Step 2: Add a DID attribute.
 */
export async function addDIDAttribute(
  eoaWalletClient: WalletClient,
  publicClient: PublicClient,
  params: {
    registry: `0x${string}`
    attrName: `0x${string}`
    attrValue: Uint8Array | `0x${string}`
    validity: bigint
  }
): Promise<Hash> {
  const eoaAddress = eoaWalletClient.account!.address
  const valueHex = params.attrValue instanceof Uint8Array ? toHex(params.attrValue) : params.attrValue

  const data = encodeFunctionData({
    abi: REVOCATION_DID_MANAGER_ABI,
    functionName: 'setAttributeForIdentity',
    args: [params.registry, params.attrName, valueHex, params.validity],
  })

  const hash = await eoaWalletClient.sendTransaction({
    to: eoaAddress, data, gas: 200_000n,
    chain: eoaWalletClient.chain, account: eoaWalletClient.account!,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') throw new Error(`addDIDAttribute reverted (txHash: ${hash})`)
  return hash
}

/**
 * Step 3: Revoke a DID attribute via ERC-1056 (sets validTo=0 in the registry).
 */
export async function revokeAttribute(
  eoaWalletClient: WalletClient,
  publicClient: PublicClient,
  params: {
    registry: `0x${string}`
    attrName: `0x${string}`
    attrValue: Uint8Array | `0x${string}`
  }
): Promise<Hash> {
  const eoaAddress = eoaWalletClient.account!.address
  const valueHex = params.attrValue instanceof Uint8Array ? toHex(params.attrValue) : params.attrValue

  const data = encodeFunctionData({
    abi: REVOCATION_DID_MANAGER_ABI,
    functionName: 'revokeAttributeForIdentity',
    args: [params.registry, params.attrName, valueHex],
  })

  const hash = await eoaWalletClient.sendTransaction({
    to: eoaAddress, data, gas: 200_000n,
    chain: eoaWalletClient.chain, account: eoaWalletClient.account!,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') throw new Error(`revokeAttribute reverted (txHash: ${hash})`)
  return hash
}

/**
 * Step 4: Record credential revocation in EOA storage.
 */
export async function revokeCredential(
  eoaWalletClient: WalletClient,
  publicClient: PublicClient,
  params: {
    credentialId: `0x${string}`
  }
): Promise<Hash> {
  const eoaAddress = eoaWalletClient.account!.address

  const data = encodeFunctionData({
    abi: REVOCATION_DID_MANAGER_ABI,
    functionName: 'revokeCredential',
    args: [params.credentialId],
  })

  const hash = await eoaWalletClient.sendTransaction({
    to: eoaAddress, data, gas: 100_000n,
    chain: eoaWalletClient.chain, account: eoaWalletClient.account!,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') throw new Error(`revokeCredential reverted (txHash: ${hash})`)
  return hash
}

/**
 * Step 5: Check if a credential is revoked. Readable by anyone via eth_call.
 */
export async function checkIsRevoked(
  publicClient: PublicClient,
  params: {
    eoaAddress: `0x${string}`
    credentialId: `0x${string}`
  }
): Promise<boolean> {
  return publicClient.readContract({
    address: params.eoaAddress,
    abi: REVOCATION_DID_MANAGER_ABI,
    functionName: 'isRevoked',
    args: [params.credentialId],
  }) as Promise<boolean>
}

/** Helper: derive a credentialId from an arbitrary string. */
export function credentialIdFromString(id: string): `0x${string}` {
  return keccak256(new TextEncoder().encode(id) as unknown as `0x${string}`)
}

// src/patterns/revocation.ts
// Pattern 6: Revocation registry integration via EIP-7702
//
// The EOA delegates to RevocationDIDManager7702, which provides:
//   - setAttributeForIdentity: add DID attributes (same as Pattern 0)
//   - revokeAttributeForIdentity: call ERC-1056 revokeAttribute (sets validTo=0)
//   - revokeCredential: write a boolean revocation flag in EOA storage keyed by credentialId
//   - isRevoked: read the revocation flag (verifiers check this on-chain)
//
// Flow (fully gasless): the EOA signs EIP-712 intents off-chain; a broadcaster
// relays the BySig variants and pays all gas. The first tx also carries the
// EOA's 7702 authorization so delegation is set atomically.
//
// EIP-712 domain: name "RevocationDIDManager7702", verifyingContract = the EOA.

import {
  type WalletClient,
  type PublicClient,
  encodeFunctionData,
  toHex,
  keccak256,
  type Hash,
} from 'viem'
import { REVOCATION_DID_MANAGER_ABI } from '../utils/abis.js'
import { managerDomain } from '../utils/eip712.js'
import { readNamespacedField } from '../utils/storage.js'

export type RevocationDelegateParams = {
  revocationDidManagerAddress: `0x${string}`
}

const REVOCATION_NONCE_OFFSET = 1

// -----------------------------------------------------------------------
// Off-chain signing (EOA side)
// -----------------------------------------------------------------------

export async function signRevocationSetAttribute(
  eoaWalletClient: WalletClient,
  params: {
    eoaAddress: `0x${string}`
    registry: `0x${string}`
    attrName: `0x${string}`
    attrValue: `0x${string}`
    validity: bigint
    nonce: bigint
    chainId: number
  }
): Promise<`0x${string}`> {
  const { eoaAddress, registry, attrName, attrValue, validity, nonce, chainId } = params
  return eoaWalletClient.signTypedData({
    account: eoaWalletClient.account!,
    domain: managerDomain('RevocationDIDManager7702', chainId, eoaAddress),
    types: {
      SetAttribute: [
        { name: 'registry', type: 'address' },
        { name: 'name', type: 'bytes32' },
        { name: 'value', type: 'bytes' },
        { name: 'validity', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
      ],
    },
    primaryType: 'SetAttribute',
    message: { registry, name: attrName, value: attrValue, validity, nonce },
  })
}

export async function signRevocationRevokeAttribute(
  eoaWalletClient: WalletClient,
  params: {
    eoaAddress: `0x${string}`
    registry: `0x${string}`
    attrName: `0x${string}`
    attrValue: `0x${string}`
    nonce: bigint
    chainId: number
  }
): Promise<`0x${string}`> {
  const { eoaAddress, registry, attrName, attrValue, nonce, chainId } = params
  return eoaWalletClient.signTypedData({
    account: eoaWalletClient.account!,
    domain: managerDomain('RevocationDIDManager7702', chainId, eoaAddress),
    types: {
      RevokeAttribute: [
        { name: 'registry', type: 'address' },
        { name: 'name', type: 'bytes32' },
        { name: 'value', type: 'bytes' },
        { name: 'nonce', type: 'uint256' },
      ],
    },
    primaryType: 'RevokeAttribute',
    message: { registry, name: attrName, value: attrValue, nonce },
  })
}

export async function signRevocationRevokeCredential(
  eoaWalletClient: WalletClient,
  params: {
    eoaAddress: `0x${string}`
    credentialId: `0x${string}`
    nonce: bigint
    chainId: number
  }
): Promise<`0x${string}`> {
  const { eoaAddress, credentialId, nonce, chainId } = params
  return eoaWalletClient.signTypedData({
    account: eoaWalletClient.account!,
    domain: managerDomain('RevocationDIDManager7702', chainId, eoaAddress),
    types: {
      RevokeCredential: [
        { name: 'credentialId', type: 'bytes32' },
        { name: 'nonce', type: 'uint256' },
      ],
    },
    primaryType: 'RevokeCredential',
    message: { credentialId, nonce },
  })
}

// -----------------------------------------------------------------------
// Broadcast (relay) side
// -----------------------------------------------------------------------

/**
 * Step 1: EOA signs the 7702 auth + a SetAttribute intent; a broadcaster sends
 * one type-4 tx that sets the delegation and calls setAttributeForIdentityBySig.
 */
export async function setupRevocationDelegation(
  signerWallet: WalletClient,
  broadcasterWallet: WalletClient,
  publicClient: PublicClient,
  params: RevocationDelegateParams & {
    registry: `0x${string}`
    attrName: `0x${string}`
    attrValue: Uint8Array | `0x${string}`
    validity: bigint
  }
): Promise<Hash> {
  const { revocationDidManagerAddress, registry, attrName, attrValue, validity } = params
  const eoaAddress = signerWallet.account!.address
  const broadcasterAddress = broadcasterWallet.account!.address
  const chainId = signerWallet.chain!.id
  const valueHex = attrValue instanceof Uint8Array ? toHex(attrValue) : attrValue

  const nonce = await readNamespacedField(publicClient, eoaAddress, 'RevocationDIDManager7702', REVOCATION_NONCE_OFFSET)

  const authorization = await signerWallet.signAuthorization({
    contractAddress: revocationDidManagerAddress,
    executor: broadcasterAddress,
    account: signerWallet.account!,
  })

  const signature = await signRevocationSetAttribute(signerWallet, {
    eoaAddress,
    registry,
    attrName,
    attrValue: valueHex,
    validity,
    nonce,
    chainId,
  })

  // Combine delegation + first setAttribute in one tx
  const data = encodeFunctionData({
    abi: REVOCATION_DID_MANAGER_ABI,
    functionName: 'setAttributeForIdentityBySig',
    args: [registry, attrName, valueHex, validity, signature],
  })

  const hash = await broadcasterWallet.sendTransaction({
    authorizationList: [authorization],
    to: eoaAddress,
    data,
    gas: 200_000n,
    chain: broadcasterWallet.chain,
    account: broadcasterWallet.account!,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') {
    throw new Error(`setupRevocationDelegation reverted (txHash: ${hash})`)
  }
  return hash
}

/**
 * Step 2: Add a DID attribute. EOA signs the intent; broadcaster relays.
 */
export async function addDIDAttribute(
  signerWallet: WalletClient,
  broadcasterWallet: WalletClient,
  publicClient: PublicClient,
  params: {
    registry: `0x${string}`
    attrName: `0x${string}`
    attrValue: Uint8Array | `0x${string}`
    validity: bigint
  }
): Promise<Hash> {
  const { registry, attrName, attrValue, validity } = params
  const eoaAddress = signerWallet.account!.address
  const chainId = signerWallet.chain!.id
  const valueHex = attrValue instanceof Uint8Array ? toHex(attrValue) : attrValue

  const nonce = await readNamespacedField(publicClient, eoaAddress, 'RevocationDIDManager7702', REVOCATION_NONCE_OFFSET)
  const signature = await signRevocationSetAttribute(signerWallet, {
    eoaAddress,
    registry,
    attrName,
    attrValue: valueHex,
    validity,
    nonce,
    chainId,
  })

  const data = encodeFunctionData({
    abi: REVOCATION_DID_MANAGER_ABI,
    functionName: 'setAttributeForIdentityBySig',
    args: [registry, attrName, valueHex, validity, signature],
  })

  const hash = await broadcasterWallet.sendTransaction({
    to: eoaAddress,
    data,
    gas: 200_000n,
    chain: broadcasterWallet.chain,
    account: broadcasterWallet.account!,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') throw new Error(`addDIDAttribute reverted (txHash: ${hash})`)
  return hash
}

/**
 * Step 3: Revoke a DID attribute via ERC-1056 (sets validTo=0 in the registry).
 * EOA signs the intent; broadcaster relays.
 */
export async function revokeAttribute(
  signerWallet: WalletClient,
  broadcasterWallet: WalletClient,
  publicClient: PublicClient,
  params: {
    registry: `0x${string}`
    attrName: `0x${string}`
    attrValue: Uint8Array | `0x${string}`
  }
): Promise<Hash> {
  const { registry, attrName, attrValue } = params
  const eoaAddress = signerWallet.account!.address
  const chainId = signerWallet.chain!.id
  const valueHex = attrValue instanceof Uint8Array ? toHex(attrValue) : attrValue

  const nonce = await readNamespacedField(publicClient, eoaAddress, 'RevocationDIDManager7702', REVOCATION_NONCE_OFFSET)
  const signature = await signRevocationRevokeAttribute(signerWallet, {
    eoaAddress,
    registry,
    attrName,
    attrValue: valueHex,
    nonce,
    chainId,
  })

  const data = encodeFunctionData({
    abi: REVOCATION_DID_MANAGER_ABI,
    functionName: 'revokeAttributeForIdentityBySig',
    args: [registry, attrName, valueHex, signature],
  })

  const hash = await broadcasterWallet.sendTransaction({
    to: eoaAddress,
    data,
    gas: 200_000n,
    chain: broadcasterWallet.chain,
    account: broadcasterWallet.account!,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') throw new Error(`revokeAttribute reverted (txHash: ${hash})`)
  return hash
}

/**
 * Step 4: Record credential revocation in EOA storage. EOA signs; broadcaster relays.
 */
export async function revokeCredential(
  signerWallet: WalletClient,
  broadcasterWallet: WalletClient,
  publicClient: PublicClient,
  params: {
    credentialId: `0x${string}`
  }
): Promise<Hash> {
  const { credentialId } = params
  const eoaAddress = signerWallet.account!.address
  const chainId = signerWallet.chain!.id

  const nonce = await readNamespacedField(publicClient, eoaAddress, 'RevocationDIDManager7702', REVOCATION_NONCE_OFFSET)
  const signature = await signRevocationRevokeCredential(signerWallet, {
    eoaAddress,
    credentialId,
    nonce,
    chainId,
  })

  const data = encodeFunctionData({
    abi: REVOCATION_DID_MANAGER_ABI,
    functionName: 'revokeCredentialBySig',
    args: [credentialId, signature],
  })

  const hash = await broadcasterWallet.sendTransaction({
    to: eoaAddress,
    data,
    gas: 100_000n,
    chain: broadcasterWallet.chain,
    account: broadcasterWallet.account!,
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

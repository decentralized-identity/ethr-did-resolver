// src/patterns/meta-tx-updates.ts
// Pattern: Gasless DID updates via EIP-712 signed meta-transactions
//
// The EOA (identity owner) signs an EIP-712 typed-data intent off-chain.
// A relayer submits the transaction and pays all gas — the EOA needs zero ETH.
//
// For the first use, the relayer can include the EOA's EIP-7702 authorization
// tuple in the same type-4 tx, atomically setting the delegation and executing
// the update in a single transaction.
//
// Replay protection: per-EOA nonce (in EOA storage) incremented after each update.
//
// EIP-712 domain:
//   name              = "MetaTxDIDManager7702"
//   version           = "1"
//   chainId           = block.chainid (prevents cross-chain replay via domain)
//   verifyingContract = EOA address  (address(this) in the delegation context)

import {
  type WalletClient,
  type PublicClient,
  encodeFunctionData,
  toHex,
  type Hash,
  type SignAuthorizationReturnType,
} from 'viem'
import { META_TX_DID_MANAGER_ABI } from '../utils/abis.js'

// -----------------------------------------------------------------------
// Parameter types
// -----------------------------------------------------------------------

export type MetaTxSetAttributeParams = {
  metaTxDidManagerAddress: `0x${string}`
  registry: `0x${string}`
  eoaAddress: `0x${string}`
  attrName: `0x${string}` // bytes32
  attrValue: Uint8Array | `0x${string}`
  validity: bigint
  nonce: bigint
  chainId: number
}

export type MetaTxSetBatchAttributesParams = {
  metaTxDidManagerAddress: `0x${string}`
  registry: `0x${string}`
  eoaAddress: `0x${string}`
  updates: Array<{
    name: `0x${string}` // bytes32
    value: Uint8Array | `0x${string}`
    validity: bigint
  }>
  nonce: bigint
  chainId: number
}

export type RelayMetaTxSetAttributeParams = {
  registry: `0x${string}`
  eoaAddress: `0x${string}`
  attrName: `0x${string}`
  attrValue: Uint8Array | `0x${string}`
  validity: bigint
  signature: `0x${string}`
  authorization?: SignAuthorizationReturnType
}

export type RelayMetaTxSetBatchAttributesParams = {
  registry: `0x${string}`
  eoaAddress: `0x${string}`
  updates: Array<{
    name: `0x${string}`
    value: Uint8Array | `0x${string}`
    validity: bigint
  }>
  signature: `0x${string}`
  authorization?: SignAuthorizationReturnType
}

// -----------------------------------------------------------------------
// Signing functions (off-chain, EOA side)
// -----------------------------------------------------------------------

/**
 * EOA signs an EIP-712 SetAttribute intent off-chain.
 * Returns a 65-byte ECDSA signature.
 */
export async function signMetaTxSetAttribute(
  eoaWalletClient: WalletClient,
  params: MetaTxSetAttributeParams
): Promise<`0x${string}`> {
  const { eoaAddress, registry, attrName, attrValue, validity, nonce, chainId } = params
  const valueHex = attrValue instanceof Uint8Array ? toHex(attrValue) : attrValue

  return eoaWalletClient.signTypedData({
    account: eoaWalletClient.account!,
    domain: {
      name: 'MetaTxDIDManager7702',
      version: '1',
      chainId,
      verifyingContract: eoaAddress,
    },
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
    message: {
      registry,
      name: attrName,
      value: valueHex,
      validity,
      nonce,
    },
  })
}

/**
 * EOA signs an EIP-712 SetBatchAttributes intent off-chain.
 * Returns a 65-byte ECDSA signature.
 */
export async function signMetaTxBatchAttributes(
  eoaWalletClient: WalletClient,
  params: MetaTxSetBatchAttributesParams
): Promise<`0x${string}`> {
  const { eoaAddress, registry, updates, nonce, chainId } = params

  const encodedUpdates = updates.map((u) => ({
    name: u.name,
    value: u.value instanceof Uint8Array ? toHex(u.value) : u.value,
    validity: u.validity,
  }))

  return eoaWalletClient.signTypedData({
    account: eoaWalletClient.account!,
    domain: {
      name: 'MetaTxDIDManager7702',
      version: '1',
      chainId,
      verifyingContract: eoaAddress,
    },
    types: {
      SetBatchAttributes: [
        { name: 'registry', type: 'address' },
        { name: 'updates', type: 'AttributeUpdate[]' },
        { name: 'nonce', type: 'uint256' },
      ],
      AttributeUpdate: [
        { name: 'name', type: 'bytes32' },
        { name: 'value', type: 'bytes' },
        { name: 'validity', type: 'uint256' },
      ],
    },
    primaryType: 'SetBatchAttributes',
    message: {
      registry,
      updates: encodedUpdates,
      nonce,
    },
  })
}

// -----------------------------------------------------------------------
// Relayer submission functions
// -----------------------------------------------------------------------

/**
 * Relayer submits a signed single-attribute update to the network.
 *
 * If `authorization` is provided, the EOA delegation is set (or refreshed)
 * atomically in the same tx — no prior EOA tx needed.
 */
export async function relayMetaTxSetAttribute(
  relayerWalletClient: WalletClient,
  publicClient: PublicClient,
  params: RelayMetaTxSetAttributeParams
): Promise<Hash> {
  const { registry, eoaAddress, attrName, attrValue, validity, signature, authorization } = params
  const valueHex = attrValue instanceof Uint8Array ? toHex(attrValue) : attrValue

  const data = encodeFunctionData({
    abi: META_TX_DID_MANAGER_ABI,
    functionName: 'setAttribute',
    args: [registry, attrName, valueHex, validity, signature],
  })

  const txParams: Parameters<typeof relayerWalletClient.sendTransaction>[0] = {
    to: eoaAddress,
    data,
    gas: 300_000n,
    chain: relayerWalletClient.chain,
    account: relayerWalletClient.account!,
  }

  if (authorization) {
    txParams.authorizationList = [authorization]
  }

  const hash = await relayerWalletClient.sendTransaction(txParams)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') {
    throw new Error(`relayMetaTxSetAttribute reverted (txHash: ${hash})`)
  }
  return hash
}

/**
 * Relayer submits a signed batch-attribute update to the network.
 *
 * If `authorization` is provided, the EOA delegation is set (or refreshed)
 * atomically in the same tx — no prior EOA tx needed.
 */
export async function relayMetaTxBatchAttributes(
  relayerWalletClient: WalletClient,
  publicClient: PublicClient,
  params: RelayMetaTxSetBatchAttributesParams
): Promise<Hash> {
  const { registry, eoaAddress, updates, signature, authorization } = params

  const encodedUpdates = updates.map((u) => ({
    name: u.name,
    value: u.value instanceof Uint8Array ? toHex(u.value) : u.value,
    validity: u.validity,
  })) as Array<{ name: `0x${string}`; value: `0x${string}`; validity: bigint }>

  const data = encodeFunctionData({
    abi: META_TX_DID_MANAGER_ABI,
    functionName: 'setBatchAttributes',
    args: [registry, encodedUpdates, signature],
  })

  const txParams: Parameters<typeof relayerWalletClient.sendTransaction>[0] = {
    to: eoaAddress,
    data,
    gas: 500_000n,
    chain: relayerWalletClient.chain,
    account: relayerWalletClient.account!,
  }

  if (authorization) {
    txParams.authorizationList = [authorization]
  }

  const hash = await relayerWalletClient.sendTransaction(txParams)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') {
    throw new Error(`relayMetaTxBatchAttributes reverted (txHash: ${hash})`)
  }
  return hash
}

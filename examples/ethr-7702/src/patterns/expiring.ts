// src/patterns/expiring.ts
// Pattern 10: Expiring delegation (app-level TTL)
//
// ExpiringDIDManager7702 enforces an app-level time-to-live: the EOA configures
// an expiry timestamp; DID writes succeed before expiry and revert after.
//
// Flow (fully gasless):
//   1. EOA signs the 7702 auth + an EIP-712 Configure intent; a broadcaster
//      relays configureBySig (delegation + expiry set atomically).
//   2. Writes are un-gated (no msg.sender check), so a broadcaster sends the
//      setAttributeForIdentity call directly and pays gas.
//
// EIP-712 domain: name "ExpiringDIDManager7702", verifyingContract = the EOA.

import {
  type WalletClient,
  type PublicClient,
  encodeFunctionData,
  toHex,
  type Hash,
} from 'viem'
import { EXPIRING_DID_MANAGER_ABI } from '../utils/abis.js'
import { managerDomain } from '../utils/eip712.js'
import { readNamespacedField } from '../utils/storage.js'

const EXPIRING_NONCE_OFFSET = 1

export type ExpiringConfigureParams = {
  expiringDidManagerAddress: `0x${string}`
  expiry: bigint
}

export type ExpiringWriteParams = {
  registry: `0x${string}`
  eoaAddress: `0x${string}`
  attrName: `0x${string}`
  attrValue: Uint8Array | `0x${string}`
  validity: bigint
}

// -----------------------------------------------------------------------
// Off-chain signing (EOA side)
// -----------------------------------------------------------------------

/** EOA signs an EIP-712 Configure intent for the gasless configure relay. */
export async function signExpiringConfigure(
  eoaWalletClient: WalletClient,
  params: {
    eoaAddress: `0x${string}`
    expiry: bigint
    nonce: bigint
    chainId: number
  }
): Promise<`0x${string}`> {
  const { eoaAddress, expiry, nonce, chainId } = params
  return eoaWalletClient.signTypedData({
    account: eoaWalletClient.account!,
    domain: managerDomain('ExpiringDIDManager7702', chainId, eoaAddress),
    types: {
      Configure: [
        { name: 'expiry', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
      ],
    },
    primaryType: 'Configure',
    message: { expiry, nonce },
  })
}

// -----------------------------------------------------------------------
// Broadcast (relay) side
// -----------------------------------------------------------------------

/**
 * Step 1: EOA signs the 7702 auth + a Configure intent; a broadcaster sends one
 * type-4 tx that sets the delegation and calls configureBySig. Gasless.
 */
export async function configureExpiringBySig(
  signerWallet: WalletClient,
  broadcasterWallet: WalletClient,
  publicClient: PublicClient,
  params: ExpiringConfigureParams
): Promise<Hash> {
  const { expiringDidManagerAddress, expiry } = params
  const eoaAddress = signerWallet.account!.address
  const broadcasterAddress = broadcasterWallet.account!.address
  const chainId = signerWallet.chain!.id

  const nonce = await readNamespacedField(publicClient, eoaAddress, 'ExpiringDIDManager7702', EXPIRING_NONCE_OFFSET)

  const authorization = await signerWallet.signAuthorization({
    contractAddress: expiringDidManagerAddress,
    executor: broadcasterAddress,
    account: signerWallet.account!,
  })

  const signature = await signExpiringConfigure(signerWallet, {
    eoaAddress,
    expiry,
    nonce,
    chainId,
  })

  const data = encodeFunctionData({
    abi: EXPIRING_DID_MANAGER_ABI,
    functionName: 'configureBySig',
    args: [expiry, signature],
  })

  const hash = await broadcasterWallet.sendTransaction({
    authorizationList: [authorization],
    to: eoaAddress,
    data,
    gas: 100_000n,
    chain: broadcasterWallet.chain,
    account: broadcasterWallet.account!,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') {
    throw new Error(`configureExpiringBySig reverted (txHash: ${hash})`)
  }

  return hash
}

/**
 * Step 2: Write a DID attribute before expiry. Un-gated, so the broadcaster
 * sends it directly and pays gas.
 */
export async function expiringSetAttribute(
  broadcasterWallet: WalletClient,
  publicClient: PublicClient,
  params: ExpiringWriteParams
): Promise<Hash> {
  const { registry, eoaAddress, attrName, attrValue, validity } = params
  const valueHex = attrValue instanceof Uint8Array ? toHex(attrValue) : attrValue

  const data = encodeFunctionData({
    abi: EXPIRING_DID_MANAGER_ABI,
    functionName: 'setAttributeForIdentity',
    args: [registry, attrName, valueHex, validity],
  })

  const hash = await broadcasterWallet.sendTransaction({
    to: eoaAddress,
    data,
    gas: 300_000n,
    chain: broadcasterWallet.chain,
    account: broadcasterWallet.account!,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') {
    throw new Error(`expiringSetAttribute reverted (txHash: ${hash})`)
  }

  return hash
}

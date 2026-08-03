// src/patterns/policy-enforced.ts
// Pattern 3: Policy-enforced DID updates via EIP-7702 + session key
//
// The EOA delegates to PolicyDIDManager7702, which enforces:
//   - Only a registered session key can update attributes
//   - Attribute names must match an allowed prefix
//   - Validity is capped at a maximum value
//
// Flow (fully gasless):
//   1. EOA signs the 7702 auth + an EIP-712 Configure intent; a broadcaster
//      relays configureBySig (delegation + policy set atomically, EOA pays zero gas).
//   2. The registered session key signs an EIP-712 SetAttributeViaSessionKey
//      intent; a broadcaster relays setAttributeViaSessionKeyBySig.
//
// EIP-712 domain: name "PolicyDIDManager7702", verifyingContract = the EOA.

import {
  type WalletClient,
  type PublicClient,
  encodeFunctionData,
  toHex,
  type Hash,
} from 'viem'
import { POLICY_DID_MANAGER_ABI } from '../utils/abis.js'
import { managerDomain } from '../utils/eip712.js'
import { readNamespacedField } from '../utils/storage.js'

export type PolicyConfigParams = {
  policyDidManagerAddress: `0x${string}`
  sessionKey: `0x${string}`
  maxValidity: bigint
  /** bytes32 prefix — only attributes whose name starts with this string are accepted */
  allowedPrefix: `0x${string}`
}

export type PolicyUpdateParams = {
  registry: `0x${string}`
  policyDidManagerAddress: `0x${string}`
  eoaAddress: `0x${string}`
  attrName: `0x${string}` // bytes32
  attrValue: Uint8Array | `0x${string}`
  validity: bigint
}

const POLICY_NONCE_OFFSET = 3
const POLICY_SESSION_NONCE_OFFSET = 4

// -----------------------------------------------------------------------
// Off-chain signing (EOA / session key side)
// -----------------------------------------------------------------------

/** EOA signs an EIP-712 Configure intent for the policy relay. */
export async function signPolicyConfigure(
  eoaWalletClient: WalletClient,
  params: {
    eoaAddress: `0x${string}`
    sessionKey: `0x${string}`
    maxValidity: bigint
    allowedPrefix: `0x${string}`
    nonce: bigint
    chainId: number
  }
): Promise<`0x${string}`> {
  const { eoaAddress, sessionKey, maxValidity, allowedPrefix, nonce, chainId } = params
  return eoaWalletClient.signTypedData({
    account: eoaWalletClient.account!,
    domain: managerDomain('PolicyDIDManager7702', chainId, eoaAddress),
    types: {
      Configure: [
        { name: 'sessionKey', type: 'address' },
        { name: 'maxValidity', type: 'uint256' },
        { name: 'allowedPrefix', type: 'bytes32' },
        { name: 'nonce', type: 'uint256' },
      ],
    },
    primaryType: 'Configure',
    message: { sessionKey, maxValidity, allowedPrefix, nonce },
  })
}

/** Session key signs an EIP-712 SetAttributeViaSessionKey intent for the relay. */
export async function signPolicySessionKeyUpdate(
  sessionKeyWalletClient: WalletClient,
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
  return sessionKeyWalletClient.signTypedData({
    account: sessionKeyWalletClient.account!,
    domain: managerDomain('PolicyDIDManager7702', chainId, eoaAddress),
    types: {
      SetAttributeViaSessionKey: [
        { name: 'registry', type: 'address' },
        { name: 'name', type: 'bytes32' },
        { name: 'value', type: 'bytes' },
        { name: 'validity', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
      ],
    },
    primaryType: 'SetAttributeViaSessionKey',
    message: { registry, name: attrName, value: attrValue, validity, nonce },
  })
}

// -----------------------------------------------------------------------
// Broadcast (relay) side
// -----------------------------------------------------------------------

/**
 * Step 1+2: EOA signs the 7702 auth + a Configure intent; a broadcaster sends
 * one type-4 tx that sets the delegation and calls configureBySig. Gasless.
 */
export async function configurePolicyDelegation(
  signerWallet: WalletClient,
  broadcasterWallet: WalletClient,
  publicClient: PublicClient,
  params: PolicyConfigParams
): Promise<Hash> {
  const { policyDidManagerAddress, sessionKey, maxValidity, allowedPrefix } = params
  const eoaAddress = signerWallet.account!.address
  const broadcasterAddress = broadcasterWallet.account!.address
  const chainId = signerWallet.chain!.id

  const nonce = await readNamespacedField(publicClient, eoaAddress, 'PolicyDIDManager7702', POLICY_NONCE_OFFSET)

  // 7702 auth — executor: the broadcaster
  const authorization = await signerWallet.signAuthorization({
    contractAddress: policyDidManagerAddress,
    executor: broadcasterAddress,
    account: signerWallet.account!,
  })

  // EIP-712 Configure intent
  const signature = await signPolicyConfigure(signerWallet, {
    eoaAddress,
    sessionKey,
    maxValidity,
    allowedPrefix,
    nonce,
    chainId,
  })

  const data = encodeFunctionData({
    abi: POLICY_DID_MANAGER_ABI,
    functionName: 'configureBySig',
    args: [sessionKey, maxValidity, allowedPrefix, signature],
  })

  // One type-4 tx: delegation + configure
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
    throw new Error(`configurePolicyDelegation reverted (txHash: ${hash})`)
  }

  return hash
}

/**
 * Step 3: The session key signs an EIP-712 SetAttributeViaSessionKey intent; a
 * broadcaster relays setAttributeViaSessionKeyBySig to the EOA. Gasless for the
 * session key. The delegated PolicyDIDManager7702 code enforces the policy.
 */
export async function sessionKeyDidUpdate(
  sessionKeyWalletClient: WalletClient,
  broadcasterWallet: WalletClient,
  publicClient: PublicClient,
  params: PolicyUpdateParams
): Promise<Hash> {
  const { registry, policyDidManagerAddress, eoaAddress, attrName, attrValue, validity } = params
  const chainId = sessionKeyWalletClient.chain!.id

  const valueHex = attrValue instanceof Uint8Array ? toHex(attrValue) : attrValue
  const nonce = await readNamespacedField(publicClient, eoaAddress, 'PolicyDIDManager7702', POLICY_SESSION_NONCE_OFFSET)

  const signature = await signPolicySessionKeyUpdate(sessionKeyWalletClient, {
    eoaAddress,
    registry,
    attrName,
    attrValue: valueHex,
    validity,
    nonce,
    chainId,
  })

  const data = encodeFunctionData({
    abi: POLICY_DID_MANAGER_ABI,
    functionName: 'setAttributeViaSessionKeyBySig',
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
  if (receipt.status === 'reverted') {
    throw new Error(`sessionKeyDidUpdate reverted (txHash: ${hash})`)
  }

  return hash
}

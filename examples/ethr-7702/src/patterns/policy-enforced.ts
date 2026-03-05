// src/patterns/policy-enforced.ts
// Pattern 3: Policy-enforced DID updates via EIP-7702 + session key
//
// The EOA delegates to PolicyDIDManager7702, which enforces:
//   - Only a registered session key can update attributes
//   - Attribute names must match an allowed prefix
//   - Validity is capped at a maximum value
//
// Flow:
//   1. EOA signs 7702 auth pointing to PolicyDIDManager7702
//   2. EOA sends a config tx (delegated self-call) to register the session key + policy
//   3. Session key sends attribute updates — no further EOA involvement needed

import {
  type WalletClient,
  type PublicClient,
  encodeFunctionData,
  toHex,
  type Hash,
} from 'viem'
import { POLICY_DID_MANAGER_ABI } from '../utils/abis.js'

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

/**
 * Step 1+2: EOA delegates to PolicyDIDManager7702 and configures the session key policy.
 * Both the delegation and the configure() call happen in one type-4 tx.
 */
export async function configurePolicyDelegation(
  eoaWalletClient: WalletClient,
  publicClient: PublicClient,
  params: PolicyConfigParams
): Promise<Hash> {
  const { policyDidManagerAddress, sessionKey, maxValidity, allowedPrefix } = params
  const eoaAddress = eoaWalletClient.account!.address

  // Sign 7702 auth — executor: 'self' (EOA sends this config tx itself)
  const authorization = await eoaWalletClient.signAuthorization({
    contractAddress: policyDidManagerAddress,
    executor: 'self',
  })

  // Encode configure() call
  const data = encodeFunctionData({
    abi: POLICY_DID_MANAGER_ABI,
    functionName: 'configure',
    args: [sessionKey, maxValidity, allowedPrefix],
  })

  // One type-4 tx: delegation + configure
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

/**
 * Step 3: Session key updates a DID attribute on behalf of the delegating EOA.
 * The session key sends a normal (type-2) tx to the EOA address; the policy
 * contract code (delegated via 7702) enforces the rules.
 */
export async function sessionKeyDidUpdate(
  sessionKeyWalletClient: WalletClient,
  publicClient: PublicClient,
  params: PolicyUpdateParams
): Promise<Hash> {
  const { registry, eoaAddress, attrName, attrValue, validity } = params

  const valueHex = attrValue instanceof Uint8Array ? toHex(attrValue) : attrValue
  const data = encodeFunctionData({
    abi: POLICY_DID_MANAGER_ABI,
    functionName: 'setAttributeViaSessionKey',
    args: [registry, attrName, valueHex, validity],
  })

  // Call the EOA directly — its code is now PolicyDIDManager7702 via 7702 delegation
  // Provide explicit gas since eth_estimateGas may fail when calling a 7702-delegated EOA
  // from an account that has never sent a tx (nonce=0) — Anvil cannot simulate the delegation
  // in gas estimation context without a prior tx from the session key.
  const hash = await sessionKeyWalletClient.sendTransaction({
    to: eoaAddress,
    data,
    gas: 200_000n,
    chain: sessionKeyWalletClient.chain,
    account: sessionKeyWalletClient.account!,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') {
    throw new Error(`sessionKeyDidUpdate reverted (txHash: ${hash})`)
  }

  return hash
}

// src/patterns/multisig-updates.ts
// Pattern 4: Multi-sig DID updates via EIP-7702
//
// The EOA delegates to MultiSigDIDManager7702 and configures a set of co-signers
// plus a threshold M. Any caller can then submit an attribute update together with
// M ECDSA signatures over the canonical update digest — no single key has unilateral
// control.
//
// Flow:
//   1. EOA signs 7702 auth pointing to MultiSigDIDManager7702 (executor: 'self')
//   2. EOA sends a config tx: sets delegation + calls configure([signers], threshold)
//   3. Off-chain: M co-signers sign the update digest (fetchable via updateDigest())
//   4. Any submitter calls setAttributeWithMultiSig(..., sigs) — EOA involvement: zero

import {
  type WalletClient,
  type PublicClient,
  encodeFunctionData,
  toHex,
  type Hash,
} from 'viem'
import { MULTISIG_DID_MANAGER_ABI } from '../utils/abis.js'

export type MultiSigConfigParams = {
  multiSigDidManagerAddress: `0x${string}`
  signers: `0x${string}`[]
  threshold: bigint
}

export type MultiSigUpdateParams = {
  registry: `0x${string}`
  multiSigDidManagerAddress: `0x${string}`
  eoaAddress: `0x${string}`
  attrName: `0x${string}` // bytes32
  attrValue: Uint8Array | `0x${string}`
  validity: bigint
  /** Signatures ordered by ascending signer address */
  signatures: `0x${string}`[]
}

/**
 * Step 1+2: EOA delegates to MultiSigDIDManager7702 and configures the signer set.
 */
export async function configureMultiSigDelegation(
  eoaWalletClient: WalletClient,
  publicClient: PublicClient,
  params: MultiSigConfigParams
): Promise<Hash> {
  const { multiSigDidManagerAddress, signers, threshold } = params
  const eoaAddress = eoaWalletClient.account!.address

  const authorization = await eoaWalletClient.signAuthorization({
    contractAddress: multiSigDidManagerAddress,
    executor: 'self',
    account: eoaWalletClient.account!,
  })

  const data = encodeFunctionData({
    abi: MULTISIG_DID_MANAGER_ABI,
    functionName: 'configure',
    args: [signers, threshold],
  })

  const hash = await eoaWalletClient.sendTransaction({
    authorizationList: [authorization],
    to: eoaAddress,
    data,
    chain: eoaWalletClient.chain,
    account: eoaWalletClient.account!,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') {
    throw new Error(`configureMultiSigDelegation reverted (txHash: ${hash})`)
  }

  return hash
}

/**
 * Fetch the digest that co-signers must sign off-chain.
 * This reads from the EOA's deployed code (MultiSigDIDManager7702 via 7702 delegation).
 */
export async function getUpdateDigest(
  publicClient: PublicClient,
  params: {
    eoaAddress: `0x${string}`
    registry: `0x${string}`
    attrName: `0x${string}`
    attrValue: Uint8Array | `0x${string}`
    validity: bigint
    nonce: bigint
  }
): Promise<`0x${string}`> {
  const valueHex = params.attrValue instanceof Uint8Array ? toHex(params.attrValue) : params.attrValue

  const digest = await publicClient.readContract({
    address: params.eoaAddress,
    abi: MULTISIG_DID_MANAGER_ABI,
    functionName: 'updateDigest',
    args: [params.registry, params.attrName, valueHex, params.validity, params.nonce],
  })

  return digest as `0x${string}`
}

/**
 * Step 4: Submit a multi-sig DID attribute update.
 * The submitter can be anyone (EOA, relayer, etc.).
 * Signatures must be ordered by ascending signer address.
 */
export async function multiSigDidUpdate(
  submitterWalletClient: WalletClient,
  publicClient: PublicClient,
  params: MultiSigUpdateParams
): Promise<Hash> {
  const { registry, eoaAddress, attrName, attrValue, validity, signatures } = params

  const valueHex = attrValue instanceof Uint8Array ? toHex(attrValue) : attrValue

  const data = encodeFunctionData({
    abi: MULTISIG_DID_MANAGER_ABI,
    functionName: 'setAttributeWithMultiSig',
    args: [registry, attrName, valueHex, validity, signatures],
  })

  const hash = await submitterWalletClient.sendTransaction({
    to: eoaAddress,
    data,
    gas: 300_000n,
    chain: submitterWalletClient.chain,
    account: submitterWalletClient.account!,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') {
    throw new Error(`multiSigDidUpdate reverted (txHash: ${hash})`)
  }

  return hash
}

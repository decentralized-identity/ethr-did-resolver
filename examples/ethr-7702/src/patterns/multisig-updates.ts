// src/patterns/multisig-updates.ts
// Pattern 4: Multi-sig DID updates via EIP-7702
//
// The EOA delegates to MultiSigDIDManager7702 and configures a set of co-signers
// plus a threshold M. Any caller can then submit an attribute update together with
// M ECDSA signatures over the canonical update digest — no single key has unilateral
// control.
//
// Flow (fully gasless for the EOA):
//   1. EOA signs the 7702 auth + an EIP-712 Configure intent; a broadcaster
//      relays configureBySig (delegation + signer set set atomically).
//   2. Off-chain: M co-signers sign the update digest (fetchable via updateDigest()).
//   3. Any caller (here: the broadcaster) submits setAttributeWithMultiSig(..., sigs).
//
// EIP-712 domain: name "MultiSigDIDManager7702", verifyingContract = the EOA.

import {
  type WalletClient,
  type PublicClient,
  encodeFunctionData,
  toHex,
  type Hash,
} from 'viem'
import { MULTISIG_DID_MANAGER_ABI } from '../utils/abis.js'
import { managerDomain } from '../utils/eip712.js'
import { readNamespacedField } from '../utils/storage.js'

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

const MULTISIG_NONCE_OFFSET = 2

// -----------------------------------------------------------------------
// Off-chain signing (EOA side)
// -----------------------------------------------------------------------

/** EOA signs an EIP-712 Configure intent for the gasless configure relay. */
export async function signMultiSigConfigure(
  eoaWalletClient: WalletClient,
  params: {
    eoaAddress: `0x${string}`
    signers: `0x${string}`[]
    threshold: bigint
    nonce: bigint
    chainId: number
  }
): Promise<`0x${string}`> {
  const { eoaAddress, signers, threshold, nonce, chainId } = params
  return eoaWalletClient.signTypedData({
    account: eoaWalletClient.account!,
    domain: managerDomain('MultiSigDIDManager7702', chainId, eoaAddress),
    types: {
      Configure: [
        { name: 'signers', type: 'address[]' },
        { name: 'threshold', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
      ],
    },
    primaryType: 'Configure',
    message: { signers, threshold, nonce },
  })
}

// -----------------------------------------------------------------------
// Broadcast (relay) side
// -----------------------------------------------------------------------

/**
 * Step 1: EOA signs the 7702 auth + a Configure intent; a broadcaster sends one
 * type-4 tx that sets the delegation and calls configureBySig. Gasless.
 */
export async function configureMultiSigDelegation(
  signerWallet: WalletClient,
  broadcasterWallet: WalletClient,
  publicClient: PublicClient,
  params: MultiSigConfigParams
): Promise<Hash> {
  const { multiSigDidManagerAddress, signers, threshold } = params
  const eoaAddress = signerWallet.account!.address
  const broadcasterAddress = broadcasterWallet.account!.address
  const chainId = signerWallet.chain!.id

  const nonce = await readNamespacedField(publicClient, eoaAddress, 'MultiSigDIDManager7702', MULTISIG_NONCE_OFFSET)

  const authorization = await signerWallet.signAuthorization({
    contractAddress: multiSigDidManagerAddress,
    executor: broadcasterAddress,
    account: signerWallet.account!,
  })

  const signature = await signMultiSigConfigure(signerWallet, {
    eoaAddress,
    signers,
    threshold,
    nonce,
    chainId,
  })

  const data = encodeFunctionData({
    abi: MULTISIG_DID_MANAGER_ABI,
    functionName: 'configureBySig',
    args: [signers, threshold, signature],
  })

  const hash = await broadcasterWallet.sendTransaction({
    authorizationList: [authorization],
    to: eoaAddress,
    data,
    gas: 300_000n,
    chain: broadcasterWallet.chain,
    account: broadcasterWallet.account!,
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
 * The submitter can be anyone (EOA, relayer, etc.) — here the broadcaster,
 * which pays the gas. Signatures must be ordered by ascending signer address.
 */
export async function multiSigDidUpdate(
  broadcasterWallet: WalletClient,
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

  const hash = await broadcasterWallet.sendTransaction({
    to: eoaAddress,
    data,
    gas: 300_000n,
    chain: broadcasterWallet.chain,
    account: broadcasterWallet.account!,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') {
    throw new Error(`multiSigDidUpdate reverted (txHash: ${hash})`)
  }

  return hash
}

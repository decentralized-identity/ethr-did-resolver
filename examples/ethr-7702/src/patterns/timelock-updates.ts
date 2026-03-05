// src/patterns/timelock-updates.ts
// Pattern 5: Time-locked DID key rotation via EIP-7702
//
// The EOA delegates to TimelockDIDManager7702 and sets a delay (seconds). To update
// a DID attribute it must propose() the change; after the delay elapses, anyone can
// execute() it. The EOA can cancel() any pending proposal before execution.
//
// Flow:
//   1. EOA signs 7702 auth + calls configure(delay) in one tx
//   2. EOA calls propose(registry, name, value, validity) — returns proposalId
//   3. Wait `delay` seconds (advance time in tests via Anvil's evm_increaseTime)
//   4. Anyone calls execute(proposalId) — attribute lands in the registry

import {
  type WalletClient,
  type PublicClient,
  encodeFunctionData,
  toHex,
  type Hash,
} from 'viem'
import { TIMELOCK_DID_MANAGER_ABI } from '../utils/abis.js'

export type TimelockConfigParams = {
  timelockDidManagerAddress: `0x${string}`
  delay: bigint // seconds
}

export type TimelockProposeParams = {
  registry: `0x${string}`
  timelockDidManagerAddress: `0x${string}`
  attrName: `0x${string}` // bytes32
  attrValue: Uint8Array | `0x${string}`
  validity: bigint
}

/**
 * Step 1: EOA delegates to TimelockDIDManager7702 and sets the delay.
 */
export async function configureTimelockDelegation(
  eoaWalletClient: WalletClient,
  publicClient: PublicClient,
  params: TimelockConfigParams
): Promise<Hash> {
  const { timelockDidManagerAddress, delay } = params
  const eoaAddress = eoaWalletClient.account!.address

  const authorization = await eoaWalletClient.signAuthorization({
    contractAddress: timelockDidManagerAddress,
    executor: 'self',
  })

  const data = encodeFunctionData({
    abi: TIMELOCK_DID_MANAGER_ABI,
    functionName: 'configure',
    args: [delay],
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
    throw new Error(`configureTimelockDelegation reverted (txHash: ${hash})`)
  }
  return hash
}

/**
 * Step 2: EOA queues a DID attribute update. Returns the proposalId.
 */
export async function proposeDidUpdate(
  eoaWalletClient: WalletClient,
  publicClient: PublicClient,
  params: TimelockProposeParams
): Promise<{ hash: Hash; proposalId: `0x${string}` }> {
  const { registry, attrName, attrValue, validity } = params
  const eoaAddress = eoaWalletClient.account!.address

  const valueHex = attrValue instanceof Uint8Array ? toHex(attrValue) : attrValue

  const data = encodeFunctionData({
    abi: TIMELOCK_DID_MANAGER_ABI,
    functionName: 'propose',
    args: [registry, attrName, valueHex, validity],
  })

  const hash = await eoaWalletClient.sendTransaction({
    to: eoaAddress,
    data,
    gas: 200_000n,
    chain: eoaWalletClient.chain,
    account: eoaWalletClient.account!,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') {
    throw new Error(`proposeDidUpdate reverted (txHash: ${hash})`)
  }

  // Extract proposalId from the Proposed event log
  const proposedLog = receipt.logs.find((log) => log.topics.length >= 2)
  if (!proposedLog) throw new Error('Proposed event not found in receipt')
  const proposalId = proposedLog.topics[1] as `0x${string}`

  return { hash, proposalId }
}

/**
 * Step 4: Execute a queued proposal (anyone can call after delay).
 */
export async function executeDidUpdate(
  submitterWalletClient: WalletClient,
  publicClient: PublicClient,
  params: {
    timelockDidManagerAddress: `0x${string}`
    eoaAddress: `0x${string}`
    proposalId: `0x${string}`
  }
): Promise<Hash> {
  const { eoaAddress, proposalId } = params

  const data = encodeFunctionData({
    abi: TIMELOCK_DID_MANAGER_ABI,
    functionName: 'execute',
    args: [proposalId],
  })

  const hash = await submitterWalletClient.sendTransaction({
    to: eoaAddress,
    data,
    gas: 200_000n,
    chain: submitterWalletClient.chain,
    account: submitterWalletClient.account!,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') {
    throw new Error(`executeDidUpdate reverted (txHash: ${hash})`)
  }
  return hash
}

/**
 * Cancel a queued proposal (EOA only).
 */
export async function cancelDidUpdate(
  eoaWalletClient: WalletClient,
  publicClient: PublicClient,
  params: {
    eoaAddress: `0x${string}`
    proposalId: `0x${string}`
  }
): Promise<Hash> {
  const { eoaAddress, proposalId } = params

  const data = encodeFunctionData({
    abi: TIMELOCK_DID_MANAGER_ABI,
    functionName: 'cancel',
    args: [proposalId],
  })

  const hash = await eoaWalletClient.sendTransaction({
    to: eoaAddress,
    data,
    gas: 100_000n,
    chain: eoaWalletClient.chain,
    account: eoaWalletClient.account!,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') {
    throw new Error(`cancelDidUpdate reverted (txHash: ${hash})`)
  }
  return hash
}

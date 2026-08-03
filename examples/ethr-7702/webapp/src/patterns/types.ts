// Shared types for the pattern registry.
//
// A Pattern is an ordered list of Steps. Each Step runs one on-chain action
// (usually one type-4 transaction) against the connected network and returns a
// human-readable result. The UI renders each step, runs it, and re-resolves the
// DID document after it completes.

import type { Hash, PublicClient, WalletClient, Address } from 'viem'
import type { NetworkConfig } from '../config/chains'
import type { KeyManager, KeyRole } from '../lib/keys'
import type { DeployedAll } from '../lib/deploy'

export type StepResult = {
  /** Transaction hash if a tx was sent. */
  txHash?: Hash
  /** One-line summary of what happened. */
  summary: string
  /** Optional longer explanation / extra data shown in a code block. */
  detail?: string
}

export type StepContext = {
  network: NetworkConfig
  publicClient: PublicClient
  keys: KeyManager
  addresses: DeployedAll
  /** Build a wallet client for a given key role (local signer, never pays gas). */
  walletFor: (role: KeyRole) => WalletClient
  /** The account that broadcasts transactions and pays the gas. */
  broadcaster: WalletClient
  /** The broadcaster account address (executor for 7702 authorizations). */
  broadcasterAddress: Address
  /** The identity EOA (the DID subject). */
  identityAddress: `0x${string}`
}

export type Step = {
  title: string
  description: string
  run: (ctx: StepContext) => Promise<StepResult>
}

export type Pattern = {
  id: string
  /** Display number, e.g. "0", "1", "1a", "4", "8". */
  number: string
  title: string
  summary: string
  /** Contract(s) involved. */
  contract: string
  /** True if this pattern needs a local Anvil (e.g. time-warp) to fully demo. */
  localOnly?: boolean
  steps: Step[]
}

// src/deploy.ts
// Orchestration: deploy all contracts to a running Anvil instance

import { type PublicClient, type WalletClient } from 'viem'
import { deployRegistry } from './utils/registry.js'

export type DeployedContracts = {
  registry: `0x${string}`
  // more will be added in Phase 2
}

export async function deployAll(
  walletClient: WalletClient,
  publicClient: PublicClient
): Promise<DeployedContracts> {
  const registry = await deployRegistry(walletClient, publicClient)
  return { registry: registry.address }
}

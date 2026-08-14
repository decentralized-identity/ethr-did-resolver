// src/utils/metamask-framework.ts
// Deploy the MetaMask Delegation Framework contracts to a local Anvil instance.
//
// The framework contracts are NOT deployed to Anvil (chainId 31337) by default.
// We load their ABIs and bytecodes directly from @metamask/delegation-abis, which
// is declared as a direct dependency (see package.json) so Node resolution finds
// it without needing to know the exact pnpm store layout of its sibling packages.
//
// Deployment order (dependencies):
//   1. EntryPoint          — no deps
//   2. DelegationManager   — constructor(owner: address)
//   3. EIP7702StatelessDeleGator — constructor(delegationManager, entryPoint)
//
// The returned addresses are consumed by the test suite and by deploy.ts.

import type { PublicClient, WalletClient } from 'viem'
import {
  DelegationManager as DelegationManagerABI,
  EIP7702StatelessDeleGator as EIP7702StatelessDeleGatorABI,
  EntryPoint as EntryPointABI,
} from '@metamask/delegation-abis'
import {
  DelegationManager as DelegationManagerBytecode,
  EIP7702StatelessDeleGator as EIP7702StatelessDeleGatorBytecode,
  EntryPoint as EntryPointBytecode,
} from '@metamask/delegation-abis/bytecode'

export type MetaMaskFramework = {
  entryPoint: `0x${string}`
  delegationManager: `0x${string}`
  statelessDeleGator: `0x${string}`
}

/**
 * Deploy the MetaMask Delegation Framework to the connected chain.
 *
 * @param walletClient - Viem wallet client (must have an account set)
 * @param publicClient - Viem public client
 * @returns Addresses of the three deployed framework contracts
 */
export async function deployMetaMaskFramework(
  walletClient: WalletClient,
  publicClient: PublicClient
): Promise<MetaMaskFramework> {
  const [account] = await walletClient.getAddresses()

  // 1. Deploy EntryPoint (no constructor args)
  const entryPointHash = await walletClient.deployContract({
    abi: EntryPointABI,
    bytecode: EntryPointBytecode,
    account,
    chain: walletClient.chain,
  })
  const entryPointReceipt = await publicClient.waitForTransactionReceipt({ hash: entryPointHash })
  if (!entryPointReceipt.contractAddress) {
    throw new Error('EntryPoint deployment failed')
  }
  const entryPoint = entryPointReceipt.contractAddress

  // 2. Deploy DelegationManager(owner = deployer account)
  const delegationManagerHash = await walletClient.deployContract({
    abi: DelegationManagerABI,
    bytecode: DelegationManagerBytecode,
    args: [account],
    account,
    chain: walletClient.chain,
  })
  const delegationManagerReceipt = await publicClient.waitForTransactionReceipt({
    hash: delegationManagerHash,
  })
  if (!delegationManagerReceipt.contractAddress) {
    throw new Error('DelegationManager deployment failed')
  }
  const delegationManager = delegationManagerReceipt.contractAddress

  // 3. Deploy EIP7702StatelessDeleGator(delegationManager, entryPoint)
  const deleGatorHash = await walletClient.deployContract({
    abi: EIP7702StatelessDeleGatorABI,
    bytecode: EIP7702StatelessDeleGatorBytecode,
    args: [delegationManager, entryPoint],
    account,
    chain: walletClient.chain,
  })
  const deleGatorReceipt = await publicClient.waitForTransactionReceipt({ hash: deleGatorHash })
  if (!deleGatorReceipt.contractAddress) {
    throw new Error('EIP7702StatelessDeleGator deployment failed')
  }
  const statelessDeleGator = deleGatorReceipt.contractAddress

  return { entryPoint, delegationManager, statelessDeleGator }
}

// Re-export ABIs so callers get them from one place
export { DelegationManagerABI, EIP7702StatelessDeleGatorABI, EntryPointABI }

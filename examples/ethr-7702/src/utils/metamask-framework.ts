// src/utils/metamask-framework.ts
// Deploy the MetaMask Delegation Framework contracts to a local Anvil instance.
//
// The framework contracts are NOT deployed to Anvil (chainId 31337) by default.
// We load their bytecodes from @metamask/delegation-abis and deploy them manually.
//
// Deployment order (dependencies):
//   1. EntryPoint          — no deps
//   2. DelegationManager   — constructor(owner: address)
//   3. EIP7702StatelessDeleGator — constructor(delegationManager, entryPoint)
//
// The returned addresses are consumed by the test suite and by deploy.ts.

import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import type { PublicClient, WalletClient } from 'viem'

// Resolve delegation-abis from the pnpm store (not directly accessible via package name)
// The package lives as a transitive dep of @metamask/smart-accounts-kit.
const _require = createRequire(
  fileURLToPath(
    new URL(
      '../../node_modules/.pnpm/@metamask+smart-accounts-kit@0.4.0-beta.1_viem@2.47.0_typescript@5.9.3_/node_modules/@metamask/smart-accounts-kit/dist/index.mjs',
      import.meta.url
    )
  )
)

// ABIs (from the main index barrel)
const {
  DelegationManager: DelegationManagerABI,
  EIP7702StatelessDeleGator: EIP7702StatelessDeleGatorABI,
  EntryPoint: EntryPointABI,
} = _require('@metamask/delegation-abis') as {
  DelegationManager: readonly unknown[]
  EIP7702StatelessDeleGator: readonly unknown[]
  EntryPoint: readonly unknown[]
}

// Bytecodes (from the bytecode barrel — each export is a raw hex string)
const bytecodes = _require('@metamask/delegation-abis/bytecode') as Record<string, `0x${string}`>

const DelegationManagerBytecode = bytecodes.DelegationManager
const EIP7702StatelessDeleGatorBytecode = bytecodes.EIP7702StatelessDeleGator
const EntryPointBytecode = bytecodes.EntryPoint

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

// Re-export ABIs so callers don't need to repeat the _require dance
export { DelegationManagerABI, EIP7702StatelessDeleGatorABI, EntryPointABI }

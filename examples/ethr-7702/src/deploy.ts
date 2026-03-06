// src/deploy.ts
// Orchestration: deploy all contracts to a running Anvil instance

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { type PublicClient, type WalletClient } from 'viem'
import { deployRegistry } from './utils/registry.js'
import { deployMetaMaskFramework } from './utils/metamask-framework.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export type DeployedContracts = {
  registry: `0x${string}`
  didManager: `0x${string}`
  policyDidManager: `0x${string}`
  multiSigDidManager: `0x${string}`
  revocationDidManager: `0x${string}`
  crossChainDidManager: `0x${string}`
  metaTxDidManager: `0x${string}`
  expiringDidManager: `0x${string}`
  // MetaMask Delegation Framework (Phase 13)
  entryPoint: `0x${string}`
  delegationManager: `0x${string}`
  statelessDeleGator: `0x${string}`
  didAttributeEnforcer: `0x${string}`
}

function loadArtifact(name: string): { abi: unknown[]; bytecode: `0x${string}` } {
  const path = join(__dirname, '..', 'artifacts', `${name}.json`)
  if (!existsSync(path)) {
    throw new Error(`Artifact not found: ${path}. Run pnpm build:contracts first.`)
  }
  return JSON.parse(readFileSync(path, 'utf-8'))
}

export async function deployAll(
  walletClient: WalletClient,
  publicClient: PublicClient
): Promise<DeployedContracts> {
  const [account] = await walletClient.getAddresses()

  const registry = await deployRegistry(walletClient, publicClient)

  const didManagerArtifact = loadArtifact('DIDManager7702')
  const didManagerHash = await walletClient.deployContract({
    abi: didManagerArtifact.abi,
    bytecode: didManagerArtifact.bytecode,
    account,
    chain: walletClient.chain,
  })
  const didManagerReceipt = await publicClient.waitForTransactionReceipt({ hash: didManagerHash })
  if (!didManagerReceipt.contractAddress) {
    throw new Error('DIDManager7702 deployment failed: no contract address in receipt')
  }

  const policyDidManagerArtifact = loadArtifact('PolicyDIDManager7702')
  const policyDidManagerHash = await walletClient.deployContract({
    abi: policyDidManagerArtifact.abi,
    bytecode: policyDidManagerArtifact.bytecode,
    account,
    chain: walletClient.chain,
  })
  const policyDidManagerReceipt = await publicClient.waitForTransactionReceipt({ hash: policyDidManagerHash })
  if (!policyDidManagerReceipt.contractAddress) {
    throw new Error('PolicyDIDManager7702 deployment failed: no contract address in receipt')
  }

  const multiSigDidManagerArtifact = loadArtifact('MultiSigDIDManager7702')
  const multiSigDidManagerHash = await walletClient.deployContract({
    abi: multiSigDidManagerArtifact.abi,
    bytecode: multiSigDidManagerArtifact.bytecode,
    account,
    chain: walletClient.chain,
  })
  const multiSigDidManagerReceipt = await publicClient.waitForTransactionReceipt({ hash: multiSigDidManagerHash })
  if (!multiSigDidManagerReceipt.contractAddress) {
    throw new Error('MultiSigDIDManager7702 deployment failed: no contract address in receipt')
  }

  const revocationDidManagerArtifact = loadArtifact('RevocationDIDManager7702')
  const revocationDidManagerHash = await walletClient.deployContract({
    abi: revocationDidManagerArtifact.abi,
    bytecode: revocationDidManagerArtifact.bytecode,
    account,
    chain: walletClient.chain,
  })
  const revocationDidManagerReceipt = await publicClient.waitForTransactionReceipt({ hash: revocationDidManagerHash })
  if (!revocationDidManagerReceipt.contractAddress) {
    throw new Error('RevocationDIDManager7702 deployment failed: no contract address in receipt')
  }

  const crossChainDidManagerArtifact = loadArtifact('CrossChainDIDManager7702')
  const crossChainDidManagerHash = await walletClient.deployContract({
    abi: crossChainDidManagerArtifact.abi,
    bytecode: crossChainDidManagerArtifact.bytecode,
    account,
    chain: walletClient.chain,
  })
  const crossChainDidManagerReceipt = await publicClient.waitForTransactionReceipt({ hash: crossChainDidManagerHash })
  if (!crossChainDidManagerReceipt.contractAddress) {
    throw new Error('CrossChainDIDManager7702 deployment failed: no contract address in receipt')
  }

  const metaTxDidManagerArtifact = loadArtifact('MetaTxDIDManager7702')
  const metaTxDidManagerHash = await walletClient.deployContract({
    abi: metaTxDidManagerArtifact.abi,
    bytecode: metaTxDidManagerArtifact.bytecode,
    account,
    chain: walletClient.chain,
  })
  const metaTxDidManagerReceipt = await publicClient.waitForTransactionReceipt({ hash: metaTxDidManagerHash })
  if (!metaTxDidManagerReceipt.contractAddress) {
    throw new Error('MetaTxDIDManager7702 deployment failed: no contract address in receipt')
  }

  const expiringDidManagerArtifact = loadArtifact('ExpiringDIDManager7702')
  const expiringDidManagerHash = await walletClient.deployContract({
    abi: expiringDidManagerArtifact.abi,
    bytecode: expiringDidManagerArtifact.bytecode,
    account,
    chain: walletClient.chain,
  })
  const expiringDidManagerReceipt = await publicClient.waitForTransactionReceipt({ hash: expiringDidManagerHash })
  if (!expiringDidManagerReceipt.contractAddress) {
    throw new Error('ExpiringDIDManager7702 deployment failed: no contract address in receipt')
  }

  // -------------------------------------------------------------------------
  // MetaMask Delegation Framework (Phase 13)
  // -------------------------------------------------------------------------

  const mmFramework = await deployMetaMaskFramework(walletClient, publicClient)

  const didAttributeEnforcerArtifact = loadArtifact('DIDAttributeEnforcer')
  const didAttributeEnforcerHash = await walletClient.deployContract({
    abi: didAttributeEnforcerArtifact.abi,
    bytecode: didAttributeEnforcerArtifact.bytecode,
    account,
    chain: walletClient.chain,
  })
  const didAttributeEnforcerReceipt = await publicClient.waitForTransactionReceipt({
    hash: didAttributeEnforcerHash,
  })
  if (!didAttributeEnforcerReceipt.contractAddress) {
    throw new Error('DIDAttributeEnforcer deployment failed: no contract address in receipt')
  }

  return {
    registry: registry.address,
    didManager: didManagerReceipt.contractAddress,
    policyDidManager: policyDidManagerReceipt.contractAddress,
    multiSigDidManager: multiSigDidManagerReceipt.contractAddress,
    revocationDidManager: revocationDidManagerReceipt.contractAddress,
    crossChainDidManager: crossChainDidManagerReceipt.contractAddress,
    metaTxDidManager: metaTxDidManagerReceipt.contractAddress,
    expiringDidManager: expiringDidManagerReceipt.contractAddress,
    entryPoint: mmFramework.entryPoint,
    delegationManager: mmFramework.delegationManager,
    statelessDeleGator: mmFramework.statelessDeleGator,
    didAttributeEnforcer: didAttributeEnforcerReceipt.contractAddress,
  }
}

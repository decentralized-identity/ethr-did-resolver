// src/deploy.ts
// Orchestration: deploy all contracts to a running Anvil instance

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { type PublicClient, type WalletClient } from 'viem'
import { deployRegistry } from './utils/registry.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export type DeployedContracts = {
  registry: `0x${string}`
  didManager: `0x${string}`
  policyDidManager: `0x${string}`
  multiSigDidManager: `0x${string}`
  timelockDidManager: `0x${string}`
  revocationDidManager: `0x${string}`
  crossChainDidManager: `0x${string}`
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

  const timelockDidManagerArtifact = loadArtifact('TimelockDIDManager7702')
  const timelockDidManagerHash = await walletClient.deployContract({
    abi: timelockDidManagerArtifact.abi,
    bytecode: timelockDidManagerArtifact.bytecode,
    account,
    chain: walletClient.chain,
  })
  const timelockDidManagerReceipt = await publicClient.waitForTransactionReceipt({ hash: timelockDidManagerHash })
  if (!timelockDidManagerReceipt.contractAddress) {
    throw new Error('TimelockDIDManager7702 deployment failed: no contract address in receipt')
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

  return {
    registry: registry.address,
    didManager: didManagerReceipt.contractAddress,
    policyDidManager: policyDidManagerReceipt.contractAddress,
    multiSigDidManager: multiSigDidManagerReceipt.contractAddress,
    timelockDidManager: timelockDidManagerReceipt.contractAddress,
    revocationDidManager: revocationDidManagerReceipt.contractAddress,
    crossChainDidManager: crossChainDidManagerReceipt.contractAddress,
  }
}

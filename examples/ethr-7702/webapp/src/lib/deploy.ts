// In-browser deployment of the delegation contracts.
//
// Used in two modes:
//   - local (Anvil):  auto-deploy everything, including the ERC-1056 registry,
//                     using the well-known Anvil dev key (pre-funded).
//   - testnet:        deploy only the 7 delegation managers (registry is already
//                     deployed on Sepolia/Gnosis) using the user's funded key.
//
// All artifacts are imported as static JSON so the app stays serverless.

import { type WalletClient, type PublicClient, type Hash } from 'viem'
import { EthereumDIDRegistry } from 'ethr-did-resolver'
import type { ManagerAddresses } from './deployed'

import DIDManagerArtifact from '../../../artifacts/DIDManager7702.json'
import PolicyDIDManagerArtifact from '../../../artifacts/PolicyDIDManager7702.json'
import MultiSigDIDManagerArtifact from '../../../artifacts/MultiSigDIDManager7702.json'
import RevocationDIDManagerArtifact from '../../../artifacts/RevocationDIDManager7702.json'
import CrossChainDIDManagerArtifact from '../../../artifacts/CrossChainDIDManager7702.json'
import MetaTxDIDManagerArtifact from '../../../artifacts/MetaTxDIDManager7702.json'
import ExpiringDIDManagerArtifact from '../../../artifacts/ExpiringDIDManager7702.json'

export type DeployedAll = ManagerAddresses & { registry: `0x${string}` }

async function deployArtifact(
  walletClient: WalletClient,
  publicClient: PublicClient,
  artifact: { abi: unknown[]; bytecode: string }
): Promise<`0x${string}`> {
  const hash = await walletClient.deployContract({
    abi: artifact.abi as never,
    bytecode: artifact.bytecode as `0x${string}`,
    chain: walletClient.chain,
    account: walletClient.account!,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash: hash as Hash })
  if (!receipt.contractAddress) throw new Error('deploy failed: no contract address')
  return receipt.contractAddress
}

/** Deploy the ERC-1056 registry (local mode only — testnets already have one). */
export async function deployRegistryInBrowser(
  walletClient: WalletClient,
  publicClient: PublicClient
): Promise<`0x${string}`> {
  const hash = await walletClient.deployContract({
    abi: EthereumDIDRegistry.abi,
    bytecode: EthereumDIDRegistry.bytecode as `0x${string}`,
    chain: walletClient.chain,
    account: walletClient.account!,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash: hash as Hash })
  if (!receipt.contractAddress) throw new Error('registry deploy failed: no contract address')
  return receipt.contractAddress
}

/**
 * Deploy all 7 delegation managers in the browser.
 *
 * NOTE: deploys must be sequential — each deployContract consumes a nonce from
 * the account, so parallel deploys would collide on the account nonce.
 */
export async function deployManagersInBrowser(
  walletClient: WalletClient,
  publicClient: PublicClient
): Promise<ManagerAddresses> {
  const didManager = await deployArtifact(walletClient, publicClient, DIDManagerArtifact)
  const policyDidManager = await deployArtifact(walletClient, publicClient, PolicyDIDManagerArtifact)
  const multiSigDidManager = await deployArtifact(walletClient, publicClient, MultiSigDIDManagerArtifact)
  const revocationDidManager = await deployArtifact(walletClient, publicClient, RevocationDIDManagerArtifact)
  const crossChainDidManager = await deployArtifact(walletClient, publicClient, CrossChainDIDManagerArtifact)
  const metaTxDidManager = await deployArtifact(walletClient, publicClient, MetaTxDIDManagerArtifact)
  const expiringDidManager = await deployArtifact(walletClient, publicClient, ExpiringDIDManagerArtifact)

  return {
    didManager,
    policyDidManager,
    multiSigDidManager,
    revocationDidManager,
    crossChainDidManager,
    metaTxDidManager,
    expiringDidManager,
  }
}

/** Full in-browser deployment (registry + managers). Returns all addresses. */
export async function deployAllInBrowser(
  walletClient: WalletClient,
  publicClient: PublicClient
): Promise<DeployedAll> {
  const registry = await deployRegistryInBrowser(walletClient, publicClient)
  const managers = await deployManagersInBrowser(walletClient, publicClient)
  return { ...managers, registry }
}

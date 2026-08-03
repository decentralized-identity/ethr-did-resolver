// In-browser deployment of the delegation contracts.
//
// Addresses are DETERMINISTIC: every manager is deployed through the canonical
// CREATE2 factory (see lib/create2.ts), so its address is chain-independent and
// can be computed from the artifact bytecode without any on-chain state. The
// app never needs to remember addresses — it computes them, then checks
// eth_getCode to see which ones are actually deployed on the current network.
//
// Deployment is LAZY and PER-MANAGER: each pattern declares the managers it
// needs, and only missing ones get deployed (local: auto-deploy with the Anvil
// broadcaster key; testnet: user's connected wallet pays). Nothing is deployed
// up-front "just in case".
//
// The ERC-1056 registry is the only non-deterministic contract: it has a fixed
// address per network (testnets, from config/chains.ts) or is deployed on
// demand on local Anvil.

import { type WalletClient, type PublicClient, type Hash, type Address, type Hex } from 'viem'
import { EthereumDIDRegistry } from 'ethr-did-resolver'
import type { ManagerAddresses, ManagerKey } from './deployed'
import { create2Address, deployViaCreate2 } from './create2'

import DIDManagerArtifact from '../../../artifacts/DIDManager7702.json'
import PolicyDIDManagerArtifact from '../../../artifacts/PolicyDIDManager7702.json'
import MultiSigDIDManagerArtifact from '../../../artifacts/MultiSigDIDManager7702.json'
import RevocationDIDManagerArtifact from '../../../artifacts/RevocationDIDManager7702.json'
import CrossChainDIDManagerArtifact from '../../../artifacts/CrossChainDIDManager7702.json'
import MetaTxDIDManagerArtifact from '../../../artifacts/MetaTxDIDManager7702.json'
import ExpiringDIDManagerArtifact from '../../../artifacts/ExpiringDIDManager7702.json'

export type DeployedAll = ManagerAddresses & { registry: `0x${string}` }

export type { ManagerKey } from './deployed'

/** Every delegation manager: its contract name, artifact, and deterministic address. */
export type ManagerMeta = {
  key: ManagerKey
  /** Solidity contract name, used for the CREATE2 salt and error messages. */
  contractName: string
  /** Display name shown in the UI. */
  label: string
  artifact: { abi: unknown[]; bytecode: string }
}

export const MANAGER_META: Record<ManagerKey, ManagerMeta> = {
  didManager: {
    key: 'didManager',
    contractName: 'DIDManager7702',
    label: 'DIDManager7702',
    artifact: DIDManagerArtifact as { abi: unknown[]; bytecode: string },
  },
  policyDidManager: {
    key: 'policyDidManager',
    contractName: 'PolicyDIDManager7702',
    label: 'PolicyDIDManager7702',
    artifact: PolicyDIDManagerArtifact as { abi: unknown[]; bytecode: string },
  },
  multiSigDidManager: {
    key: 'multiSigDidManager',
    contractName: 'MultiSigDIDManager7702',
    label: 'MultiSigDIDManager7702',
    artifact: MultiSigDIDManagerArtifact as { abi: unknown[]; bytecode: string },
  },
  revocationDidManager: {
    key: 'revocationDidManager',
    contractName: 'RevocationDIDManager7702',
    label: 'RevocationDIDManager7702',
    artifact: RevocationDIDManagerArtifact as { abi: unknown[]; bytecode: string },
  },
  crossChainDidManager: {
    key: 'crossChainDidManager',
    contractName: 'CrossChainDIDManager7702',
    label: 'CrossChainDIDManager7702',
    artifact: CrossChainDIDManagerArtifact as { abi: unknown[]; bytecode: string },
  },
  metaTxDidManager: {
    key: 'metaTxDidManager',
    contractName: 'MetaTxDIDManager7702',
    label: 'MetaTxDIDManager7702',
    artifact: MetaTxDIDManagerArtifact as { abi: unknown[]; bytecode: string },
  },
  expiringDidManager: {
    key: 'expiringDidManager',
    contractName: 'ExpiringDIDManager7702',
    label: 'ExpiringDIDManager7702',
    artifact: ExpiringDIDManagerArtifact as { abi: unknown[]; bytecode: string },
  },
}

export const MANAGER_KEYS = Object.keys(MANAGER_META) as ManagerKey[]

/**
 * Deterministic addresses for all 7 managers. Chain-independent: the same
 * addresses apply on Anvil, Sepolia, and Gnosis. Existence must be checked
 * separately with `isDeployed`.
 */
export function deterministicManagerAddresses(): ManagerAddresses {
  return Object.fromEntries(
    MANAGER_KEYS.map((key) => {
      const meta = MANAGER_META[key]
      return [key, create2Address(meta.contractName, meta.artifact.bytecode as Hex)]
    })
  ) as ManagerAddresses
}

/** Deploy a single manager through CREATE2 if it is not already deployed. */
export async function deployManagerInBrowser(
  walletClient: WalletClient,
  publicClient: PublicClient,
  key: ManagerKey,
  rpcUrl: string
): Promise<Address> {
  const meta = MANAGER_META[key]
  return deployViaCreate2(walletClient, publicClient, meta.contractName, meta.artifact.bytecode as Hex, rpcUrl)
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

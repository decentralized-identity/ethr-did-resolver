// Loads pre-deployed contract addresses for testnet mode.
//
// `deployed.json` is committed and filled by `scripts/deploy-testnet.ts` after a
// one-time deployment to Sepolia/Gnosis. If addresses are empty (not yet deployed),
// the app offers in-browser deployment via the user's funded burner key instead.

import deployedRaw from '../config/deployed.json'
import type { NetworkId } from '../config/chains'

export type ManagerAddresses = {
  didManager: `0x${string}`
  policyDidManager: `0x${string}`
  multiSigDidManager: `0x${string}`
  revocationDidManager: `0x${string}`
  crossChainDidManager: `0x${string}`
  metaTxDidManager: `0x${string}`
  expiringDidManager: `0x${string}`
}

export const EMPTY_MANAGER_ADDRESSES: ManagerAddresses = {
  didManager: '0x',
  policyDidManager: '0x',
  multiSigDidManager: '0x',
  revocationDidManager: '0x',
  crossChainDidManager: '0x',
  metaTxDidManager: '0x',
  expiringDidManager: '0x',
}

type DeployedFile = Record<string, Partial<ManagerAddresses>>

export function loadPredeployedManagers(networkId: NetworkId): ManagerAddresses | null {
  const entry = (deployedRaw as DeployedFile)[networkId]
  if (!entry || !entry.didManager || entry.didManager === '0x') return null

  return {
    didManager: entry.didManager as `0x${string}`,
    policyDidManager: entry.policyDidManager as `0x${string}`,
    multiSigDidManager: entry.multiSigDidManager as `0x${string}`,
    revocationDidManager: entry.revocationDidManager as `0x${string}`,
    crossChainDidManager: entry.crossChainDidManager as `0x${string}`,
    metaTxDidManager: entry.metaTxDidManager as `0x${string}`,
    expiringDidManager: entry.expiringDidManager as `0x${string}`,
  }
}

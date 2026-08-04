// Chain configuration for the interactive explainer.
//
// This is a DEMO / explainer app: it runs entirely against a local Anvil node
// (EIP-7702 hardfork). Contracts are deployed in-browser on first use via
// deterministic CREATE2 addresses. No live testnets / mainnets.

import { anvil as anvilChain, type Chain } from 'viem/chains'

export type NetworkId = 'local'

export type NetworkConfig = {
  id: NetworkId
  label: string
  chain: Chain
  rpcUrl: string
  /** ERC-1056 registry address. `null` for local (auto-deployed in-browser). */
  registry: `0x${string}` | null
  /** DID network name used in `did:ethr:<name>:0x...` for resolution. */
  didNetworkName: string
  /** CORS-friendly RPC for ethr-did-resolver (the browser must reach it). */
  resolverRpcUrl: string
}

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  local: {
    id: 'local',
    label: 'Local Anvil',
    chain: anvilChain,
    rpcUrl: 'http://127.0.0.1:8545',
    registry: null,
    didNetworkName: 'dev',
    resolverRpcUrl: 'http://127.0.0.1:8545',
  },
}

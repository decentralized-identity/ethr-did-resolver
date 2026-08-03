// Chain configuration for the interactive explainer.
//
// Three targets:
//   - local:   Anvil (Prague) at http://127.0.0.1:8545. Contracts are deployed
//              in-browser on first use (auto-deploy).
//   - sepolia: Ethereum Sepolia testnet. EIP-7702 live, registry pre-deployed.
//   - gnosis:  Gnosis Chain mainnet. EIP-7702 live (Pectra, 2025-04-30),
//              registry pre-deployed, gas is cheap xDAI.
//
// Registry addresses (ERC-1056 EthereumDIDRegistry), verified on-chain:
//   - mainnet: 0xdCa7EF03e98e0DC2B855bE647C39ABe984fcF21B
//   - sepolia + gnosis + holesky: 0x03d5003bf0e79C5F5223588F347ebA39AfbC3818

import {
  anvil as anvilChain,
  gnosis as gnosisChain,
  sepolia as sepoliaChain,
  type Chain,
} from 'viem/chains'

export type NetworkId = 'local' | 'sepolia' | 'gnosis'

export const SEPOLIA_REGISTRY = '0x03d5003bf0e79C5F5223588F347ebA39AfbC3818' as const
export const GNOSIS_REGISTRY = '0x03d5003bf0e79C5F5223588F347ebA39AfbC3818' as const

export type NetworkConfig = {
  id: NetworkId
  label: string
  chain: Chain
  rpcUrl: string
  /** ERC-1056 registry address. `null` for local (auto-deployed in-browser). */
  registry: `0x${string}` | null
  /** DID network name used in `did:ethr:<name>:0x...` for resolution. */
  didNetworkName: string
  /** CORS-friendly public RPC for ethr-did-resolver (browser must reach it). */
  resolverRpcUrl: string
  /** Testnet faucet URL (testnet mode only). */
  faucetUrl?: string
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
  sepolia: {
    id: 'sepolia',
    label: 'Sepolia',
    chain: sepoliaChain,
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    registry: SEPOLIA_REGISTRY,
    didNetworkName: 'sepolia',
    resolverRpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    faucetUrl: 'https://sepolia-faucet.pk910.de/',
  },
  gnosis: {
    id: 'gnosis',
    label: 'Gnosis Chain',
    chain: gnosisChain,
    rpcUrl: 'https://gnosis-rpc.publicnode.com',
    registry: GNOSIS_REGISTRY,
    didNetworkName: 'gno',
    resolverRpcUrl: 'https://gnosis-rpc.publicnode.com',
    faucetUrl: 'https://gnosisfaucet.com/',
  },
}

export const NETWORK_LIST: NetworkConfig[] = [NETWORKS.local, NETWORKS.sepolia, NETWORKS.gnosis]

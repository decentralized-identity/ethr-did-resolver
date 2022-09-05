/**
 * Represents metadata for a deployment of the ERC1056 registry contract.
 *
 * This can be used to correctly connect DIDs anchored on a particular network to the known registry for that network.
 */
export type EthrDidRegistryDeployment = {
  /**
   * The chain ID of the ethereum-like network for this deployment.
   *
   * The HEX encoding of this value gets used to construct DIDs anchored on this network when the `name` property is
   * not set. Example: `did:ethr:<0xHexChainId>:0x...`
   */
  chainId: number
  /**
   * The ERC1056 contract address on this network
   */
  registry: string
  /**
   * The name of the network.
   * This is used to construct DIDs on this network: `did:ethr:<name>:0x...`.
   * If this is omitted, DIDs for this network are constructed using the HEX encoding of the chainID
   */
  name?: string
  description?: string
  /**
   * A JSON-RPC endpoint that can be used to broadcast transactions or queries to this network
   */
  rpcUrl?: string
  /**
   * Contracts prior to ethr-did-registry@0.0.3 track nonces differently for meta-transactions
   *
   * @see https://github.com/decentralized-identity/ethr-did-resolver/pull/164
   */
  legacyNonce?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [x: string]: any
}

/**
 * Represents the known deployments of the ERC1056 registry contract.
 */
export const deployments: EthrDidRegistryDeployment[] = [
  { chainId: 1, registry: '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b', name: 'mainnet', legacyNonce: true },
  { chainId: 3, registry: '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b', name: 'ropsten', legacyNonce: true },
  { chainId: 4, registry: '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b', name: 'rinkeby', legacyNonce: true },
  { chainId: 5, registry: '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b', name: 'goerli', legacyNonce: true },
  { chainId: 42, registry: '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b', name: 'kovan', legacyNonce: true },
  { chainId: 30, registry: '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b', name: 'rsk', legacyNonce: true },
  { chainId: 31, registry: '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b', name: 'rsk:testnet', legacyNonce: true },
  {
    chainId: 246,
    registry: '0xE29672f34e92b56C9169f9D485fFc8b9A136BCE4',
    name: 'ewc',
    description: 'energy web chain',
    legacyNonce: false,
  },
  {
    chainId: 73799,
    registry: '0xC15D5A57A8Eb0e1dCBE5D88B8f9a82017e5Cc4AF',
    name: 'volta',
    description: 'energy web testnet',
    legacyNonce: false,
  },
  { chainId: 246785, registry: '0xdCa7EF03e98e0DC2B855bE647C39ABe984fcF21B', name: 'artis:tau1', legacyNonce: true },
  { chainId: 246529, registry: '0xdCa7EF03e98e0DC2B855bE647C39ABe984fcF21B', name: 'artis:sigma1', legacyNonce: true },
  { chainId: 137, registry: '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b', name: 'polygon', legacyNonce: true },
  { chainId: 80001, registry: '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b', name: 'polygon:test', legacyNonce: true },
  { chainId: 1313161554, registry: '0x63eD58B671EeD12Bc1652845ba5b2CDfBff198e0', name: 'aurora', legacyNonce: true },
]

export type EthrDidRegistryDeployment = {
  chainId: number
  registry: string
  name?: string
  description?: string
  rpcUrl?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [x: string]: any
}

export const deployments: EthrDidRegistryDeployment[] = [
  { chainId: 1, registry: '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b', name: 'mainnet' },
  { chainId: 3, registry: '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b', name: 'ropsten' },
  { chainId: 4, registry: '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b', name: 'rinkeby' },
  { chainId: 5, registry: '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b', name: 'goerli' },
  { chainId: 42, registry: '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b', name: 'kovan' },
  { chainId: 30, registry: '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b', name: 'rsk' },
  { chainId: 31, registry: '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b', description: 'rsk:testnet' },
  {
    chainId: 246,
    registry: '0xE29672f34e92b56C9169f9D485fFc8b9A136BCE4',
    name: 'ewc',
    description: 'energy web chain',
  },
  {
    chainId: 73799,
    registry: '0xC15D5A57A8Eb0e1dCBE5D88B8f9a82017e5Cc4AF',
    name: 'volta',
    description: 'energy web testnet',
  },
  { chainId: 246785, registry: '0xdCa7EF03e98e0DC2B855bE647C39ABe984fcF21B', description: 'artis:tau1' },
  { chainId: 246529, registry: '0xdCa7EF03e98e0DC2B855bE647C39ABe984fcF21B', description: 'artis:sigma1' },
  { chainId: 137, registry: '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b', name: 'polygon' },
  { chainId: 80001, registry: '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b', description: 'polygon:test' },
  { chainId: 1313161554, registry: '0x63eD58B671EeD12Bc1652845ba5b2CDfBff198e0', name: 'aurora' },
  { chainId: 421613, registry: '0x8FFfcD6a85D29E9C33517aaf60b16FE4548f517E', name: 'arbitrum:goerli' },
  { chainId: 59140, registry: '0x03d5003bf0e79C5F5223588F347ebA39AfbC3818', name: 'linea:goerli' },
  {
    chainId: 2442,
    registry: '0x03d5003bf0e79C5F5223588F347ebA39AfbC3818',
    name: 'cardona',
    description: 'polygon zkevm cardona testnet',
  },
  {
    chainId: 17000,
    registry: '0x03d5003bf0e79C5F5223588F347ebA39AfbC3818',
    name: 'holesky',
    description: 'ethereum infrastructure and core protocol upgrades testnet',
  },
]

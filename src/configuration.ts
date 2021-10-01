import { BigNumber } from '@ethersproject/bignumber'
import { InfuraProvider, JsonRpcProvider, Provider } from '@ethersproject/providers'
import { knownInfuraNetworks, knownNetworks } from './helpers'

/**
 * A configuration entry for an ethereum network
 * It should contain at least one of `name` or `chainId` AND one of `provider`, `web3`, or `rpcUrl`
 *
 * @example ```js
 * { name: 'development', rpcUrl: 'http://127.0.0.1:8545/' }
 * { name: 'goerli', chainId: 5, provider: new InfuraProvider('goerli') }
 * { name: 'rinkeby', provider: new AlchemyProvider('rinkeby') }
 * { name: 'rsk:testnet', chainId: '0x1f', rpcUrl: 'https://public-node.testnet.rsk.co' }
 * ```
 */
export interface ProviderConfiguration {
  name?: string
  provider?: Provider
  rpcUrl?: string
  chainId?: string | number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  web3?: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [index: string]: any
}

export interface MultiProviderConfiguration extends ProviderConfiguration {
  networks?: ProviderConfiguration[]
}

export interface InfuraConfiguration {
  infuraProjectId: string
}

export type ConfigurationOptions = MultiProviderConfiguration | InfuraConfiguration

export type ConfiguredNetworks = Record<string, Provider>

function configureNetworksWithInfura(projectId?: string): ConfiguredNetworks {
  if (!projectId) {
    return {}
  }
  const networks: ProviderConfiguration[] = [
    { name: 'mainnet', chainId: '0x1', provider: new InfuraProvider('homestead', projectId) },
    { name: 'ropsten', chainId: '0x3', provider: new InfuraProvider('ropsten', projectId) },
    { name: 'rinkeby', chainId: '0x4', provider: new InfuraProvider('rinkeby', projectId) },
    { name: 'goerli', chainId: '0x5', provider: new InfuraProvider('goerli', projectId) },
    { name: 'kovan', chainId: '0x2a', provider: new InfuraProvider('kovan', projectId) },
  ]
  return configureNetworks({ networks })
}

export function getProviderForNetwork(conf: ProviderConfiguration): Provider {
  let provider: Provider = conf.provider || conf.web3?.currentProvider
  if (!provider) {
    if (conf.rpcUrl) {
      const chainIdRaw = conf.chainId ? conf.chainId : knownNetworks[conf.name || '']
      const chainId = chainIdRaw ? BigNumber.from(chainIdRaw).toNumber() : chainIdRaw
      const networkName = knownInfuraNetworks[conf.name || ''] ? conf.name?.replace('mainnet', 'homestead') : 'any'
      provider = new JsonRpcProvider(conf.rpcUrl, chainId || networkName)
    } else {
      throw new Error(`invalid_config: No web3 provider could be determined for network ${conf.name || conf.chainId}`)
    }
  }
  return provider
}

function configureNetwork(net: ProviderConfiguration): ConfiguredNetworks {
  const networks: ConfiguredNetworks = {}
  const chainId = net.chainId || knownNetworks[net.name || '']
  if (chainId) {
    if (net.name) {
      networks[net.name] = getProviderForNetwork(net)
    }
    const id = typeof chainId === 'number' ? `0x${chainId.toString(16)}` : chainId
    networks[id] = getProviderForNetwork(net)
  } else if (net.provider || net.web3 || net.rpcUrl) {
    networks[net.name || ''] = getProviderForNetwork(net)
  }
  return networks
}

function configureNetworks(conf: MultiProviderConfiguration): ConfiguredNetworks {
  return {
    ...configureNetwork(conf),
    ...conf.networks?.reduce<ConfiguredNetworks>((networks, net) => {
      return { ...networks, ...configureNetwork(net) }
    }, {}),
  }
}

/**
 * Generates a configuration that maps ethereum network names and chainIDs to the respective web3 providers.
 * @returns a record of providers
 * @param conf configuration options for the resolver. An array of network details.
 * Each network entry should contain at least one of `name` or `chainId` AND one of `provider`, `web3`, or `rpcUrl`
 * For convenience, you can also specify an `infuraProjectId` which will create a mapping for all the networks supported by https://infura.io.
 * @example ```js
 * [
 *   { name: 'development', rpcUrl: 'http://127.0.0.1:8545/' },
 *   { name: 'goerli', chainId: 5, provider: new InfuraProvider('goerli') },
 *   { name: 'rinkeby', provider: new AlchemyProvider('rinkeby') },
 *   { name: 'rsk:testnet', chainId: '0x1f', rpcUrl: 'https://public-node.testnet.rsk.co' },
 * ]
 * ```
 */
export function configureResolverWithNetworks(conf: ConfigurationOptions = {}): ConfiguredNetworks {
  const networks = {
    ...configureNetworksWithInfura((<InfuraConfiguration>conf).infuraProjectId),
    ...configureNetworks(<MultiProviderConfiguration>conf),
  }
  if (Object.keys(networks).length === 0) {
    throw new Error('invalid_config: Please make sure to have at least one network')
  }
  return networks
}

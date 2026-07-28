import { describe, it, expect } from 'vitest'
import { InfuraProvider, JsonRpcProvider } from 'ethers'
import { configureResolverWithNetworks } from '../configuration'

describe('configuration', () => {
  it('works with infuraProjectId', () => {
    const contracts = configureResolverWithNetworks({
      infuraProjectId: 'blabla',
      networks: [{ name: 'dev', rpcUrl: 'test', registry: '0x9af37603e98e0dc2b855be647c39abe984fc2445' }],
    })
    expect(contracts['mainnet']).toBeDefined()
    expect(contracts['0x1']).toBeDefined()
    expect(contracts['dev']).toBeDefined()
    expect(contracts['aurora']).toBeDefined()
    expect(contracts['0x4e454152']).toBeDefined()
  })

  it('works with infuraProjectId and overrides', () => {
    const contracts = configureResolverWithNetworks({
      infuraProjectId: 'blabla',
      networks: [{ name: 'mainnet', rpcUrl: 'redefine me' }],
    })
    expect((<InfuraProvider>contracts['mainnet'].runner!.provider).projectId).not.toBeDefined()
    expect((<JsonRpcProvider>contracts['mainnet'].runner!.provider)._getConnection().url).toBe('redefine me')
  })

  it('works with named network', async () => {
    const contracts = configureResolverWithNetworks({
      networks: [{ name: 'aurora', provider: new JsonRpcProvider('some JSONRPC URL') }],
    })
    expect(contracts['aurora']).toBeDefined()
    expect(contracts['0x4e454152']).toBeDefined()
  })

  it('works with single network', async () => {
    const contracts = configureResolverWithNetworks({
      name: 'aurora',
      provider: new JsonRpcProvider('some JSONRPC URL'),
    })
    expect(contracts['aurora']).toBeDefined()
    expect(contracts['0x4e454152']).toBeDefined()
  })

  it('works with single provider', async () => {
    const contracts = configureResolverWithNetworks({
      provider: new JsonRpcProvider('some JSONRPC URL'),
      registry: '0x9af37603e98e0dc2b855be647c39abe984fc2445',
    })
    expect(contracts['']).toBeDefined()
  })

  it('works with only rpcUrl', async () => {
    const contracts = configureResolverWithNetworks({
      rpcUrl: 'some JSONRPC URL',
      registry: '0x9af37603e98e0dc2b855be647c39abe984fc2445',
    })
    expect(contracts['']).toBeDefined()
  })

  it('works with rpc and numbered chainId', async () => {
    const contracts = configureResolverWithNetworks({
      rpcUrl: 'some JSONRPC URL',
      chainId: BigInt(1),
    })
    expect(contracts['0x1']).toBeDefined()
  })

  it('throws when no configuration is provided', () => {
    expect(() => {
      configureResolverWithNetworks()
    }).toThrow('invalid_config: Please make sure to have at least one network')
  })

  it('throws when no registry is known for a network', () => {
    expect(() => {
      configureResolverWithNetworks({ networks: [{ name: 'unknown-net', rpcUrl: 'http://localhost:8545' }] })
    }).toThrow('invalid_config: No registry address known for network unknown-net')
  })

  it('throws when no relevant configuration is provided for a network', () => {
    expect(() => {
      configureResolverWithNetworks({ networks: [{ chainId: '0xbad' }] })
    }).toThrow('invalid_config: No web3 provider could be determined for network')
  })

  it('throws when malformed configuration is provided for a network', () => {
    expect(() => {
      configureResolverWithNetworks({ networks: [{ web3: '0xbad' }] })
    }).toThrow('invalid_config: No web3 provider could be determined for network')
  })

  it('known network by name + rpcUrl inherits registry and registers both name and hex key', () => {
    const contracts = configureResolverWithNetworks({
      networks: [{ name: 'mainnet', rpcUrl: 'http://localhost:8545' }],
    })
    expect(contracts['mainnet']).toBeDefined()
    expect(contracts['0x1']).toBeDefined()
  })

  it('known network by chainId + rpcUrl auto-registers deployment name', () => {
    const contracts = configureResolverWithNetworks({
      networks: [{ chainId: 1, rpcUrl: 'http://localhost:8545' }],
    })
    expect(contracts['mainnet']).toBeDefined()
    expect(contracts['0x1']).toBeDefined()
  })

  it('known network by chainId + rpcUrl auto-registers deployment name for non-mainnet', () => {
    const contracts = configureResolverWithNetworks({
      networks: [{ chainId: 1313161554, rpcUrl: 'http://localhost:8545' }],
    })
    expect(contracts['aurora']).toBeDefined()
    expect(contracts['0x4e454152']).toBeDefined()
  })

  it('override deployment registry address', () => {
    const contracts = configureResolverWithNetworks({
      networks: [{ name: 'mainnet', rpcUrl: 'http://localhost:8545', registry: '0x9af37603e98e0dc2b855be647c39abe984fc2445' }],
    })
    expect(contracts['mainnet']).toBeDefined()
    expect(contracts['0x1']).toBeDefined()
    expect(contracts['mainnet'].target).toBe('0x9af37603e98e0dc2b855be647c39abe984fc2445')
  })

  it('override legacyNonce in config', () => {
    const contracts = configureResolverWithNetworks({
      networks: [{ name: 'mainnet', rpcUrl: 'http://localhost:8545', legacyNonce: false }],
    })
    expect(contracts['mainnet']).toBeDefined()
    expect(contracts['0x1']).toBeDefined()
  })
})

import { InfuraProvider, JsonRpcProvider } from 'ethers'
import { configureResolverWithNetworks } from '../configuration'

describe('configuration', () => {
  it('works with infuraProjectId', () => {
    const contracts = configureResolverWithNetworks({
      infuraProjectId: 'blabla',
      networks: [{ name: 'dev', rpcUrl: 'test' }],
    })
    expect(contracts['mainnet']).toBeDefined()
    expect(contracts['0x1']).toBeDefined()
    expect(contracts['dev']).toBeDefined()
    expect(contracts['linea:goerli']).toBeDefined()
    expect(contracts['0xe704']).toBeDefined()
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
      networks: [{ name: 'linea:goerli', provider: new JsonRpcProvider('some goerli JSONRPC URL') }],
    })
    expect(contracts['linea:goerli']).toBeDefined()
    expect(contracts['0xe704']).toBeDefined()
  })

  it('works with single network', async () => {
    const contracts = configureResolverWithNetworks({
      name: 'linea:goerli',
      provider: new JsonRpcProvider('some goerli JSONRPC URL'),
    })
    expect(contracts['linea:goerli']).toBeDefined()
    expect(contracts['0xe704']).toBeDefined()
  })

  it('works with single provider', async () => {
    const contracts = configureResolverWithNetworks({
      provider: new JsonRpcProvider('some rinkeby JSONRPC URL'),
    })
    expect(contracts['']).toBeDefined()
  })

  it('works with only rpcUrl', async () => {
    const contracts = configureResolverWithNetworks({
      rpcUrl: 'some rinkeby JSONRPC URL',
    })
    expect(contracts['']).toBeDefined()
  })

  it('works with rpc and numbered chainId', async () => {
    const contracts = configureResolverWithNetworks({
      rpcUrl: 'some rinkeby JSONRPC URL',
      chainId: BigInt(1),
    })
    expect(contracts['0x1']).toBeDefined()
  })

  it('throws when no configuration is provided', () => {
    expect(() => {
      configureResolverWithNetworks()
    }).toThrowError('invalid_config: Please make sure to have at least one network')
  })

  it('throws when no relevant configuration is provided for a network', () => {
    expect(() => {
      configureResolverWithNetworks({ networks: [{ chainId: '0xbad' }] })
    }).toThrowError('invalid_config: No web3 provider could be determined for network')
  })

  it('throws when malformed configuration is provided for a network', () => {
    expect(() => {
      configureResolverWithNetworks({ networks: [{ web3: '0xbad' }] })
    }).toThrowError('invalid_config: No web3 provider could be determined for network')
  })
})

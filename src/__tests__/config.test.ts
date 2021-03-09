import { InfuraProvider, JsonRpcProvider } from '@ethersproject/providers'
import { configureResolverWithNetworks } from '../configuration'

describe('configuration', () => {
  it('works with infuraProjectId', () => {
    const contracts = configureResolverWithNetworks({
      infuraProjectId: 'blabla',
      networks: [{ name: 'dev', rpcUrl: 'test' }],
    })
    expect(contracts['mainnet']).toBeDefined()
    expect(contracts['0x1']).toBeDefined()
    expect(contracts['ropsten']).toBeDefined()
    expect(contracts['0x3']).toBeDefined()
    expect(contracts['rinkeby']).toBeDefined()
    expect(contracts['0x4']).toBeDefined()
    expect(contracts['goerli']).toBeDefined()
    expect(contracts['0x5']).toBeDefined()
    expect(contracts['kovan']).toBeDefined()
    expect(contracts['0x2a']).toBeDefined()
    expect(contracts['dev']).toBeDefined()
  })

  it('works with infuraProjectId and overrides', () => {
    const contracts = configureResolverWithNetworks({
      infuraProjectId: 'blabla',
      networks: [{ name: 'mainnet', rpcUrl: 'redefine me' }],
    })
    expect((<InfuraProvider>contracts['mainnet'].provider).projectId).not.toBeDefined()
    expect((<JsonRpcProvider>contracts['mainnet'].provider).connection.url).toBe('redefine me')
  })

  it('works with named network', async () => {
    const contracts = configureResolverWithNetworks({
      networks: [{ name: 'rinkeby', provider: new JsonRpcProvider('some rinkeby JSONRPC URL') }],
    })
    expect(contracts['rinkeby']).toBeDefined()
    expect(contracts['0x4']).toBeDefined()
  })

  it('works with single network', async () => {
    const contracts = configureResolverWithNetworks({
      name: 'rinkeby',
      provider: new JsonRpcProvider('some rinkeby JSONRPC URL'),
    })
    expect(contracts['rinkeby']).toBeDefined()
    expect(contracts['0x4']).toBeDefined()
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

  it('throws when no configuration is provided', () => {
    expect(() => {
      configureResolverWithNetworks()
    }).toThrow('invalid_config: Please make sure to have at least one network')
  })
})

import { Resolver } from 'did-resolver'
import { getResolver } from '../ethr-did-resolver'

describe('getResolver', () => {
  const addr = '0xd0dbe9d3698738f899ccd8ee27ff2347a7faa4dd'

  it('throws when no configuration is provided', () => {
    expect(() => { getResolver() })
      .toThrow('EthrDIDResolver requires a provider configuration for at least one network')
  })

  it('throws when trying to resolve a non configured network', async () => {
    const did = 'did:ethr:nonconf:' + addr
    const ethr = getResolver({ networks: [{ name: 'existent', rpcUrl: 'http://localhost:7545' }] })
    const resolver = new Resolver(ethr)
    await expect(resolver.resolve(did)).rejects.toThrow('No conf for networkId: nonconf')
  })

  it('throws when trying to resolve mainnet on a config with only private networks', async () => {
    const did = 'did:ethr:' + addr
    const ethr = getResolver({ networks: [{ name: '0x4', rpcUrl: 'http://localhost:7545' }] })
    const resolver = new Resolver(ethr)
    await expect(resolver.resolve(did)).rejects.toThrow('No conf for networkId: mainnet')
  })
})

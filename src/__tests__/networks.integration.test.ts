import { Resolver } from 'did-resolver'
import { getResolver } from '../resolver'
import { interpretIdentifier } from '../helpers'

describe('ethrResolver (alt-chains)', () => {
  const addr = '0xd0dbe9d3698738f899ccd8ee27ff2347a7faa4dd'
  const { address } = interpretIdentifier(addr)
  const checksumAddr = address

  describe('eth-testnets', () => {
    it('resolves on ropsten when configured', () => {
      const did = 'did:ethr:ropsten:' + addr
      const ethr = getResolver({
        networks: [{ name: 'ropsten', rpcUrl: 'https://ropsten.infura.io/v3/6b734e0b04454df8a6ce234023c04f26' }],
      })
      const resolver = new Resolver(ethr)
      return expect(resolver.resolve(did)).resolves.toEqual({
        didDocumentMetadata: {},
        didResolutionMetadata: { contentType: 'application/did+ld+json' },
        didDocument: {
          '@context': [
            'https://www.w3.org/ns/did/v1',
            'https://identity.foundation/EcdsaSecp256k1RecoverySignature2020/lds-ecdsa-secp256k1-recovery2020-0.0.jsonld',
          ],
          id: did,
          verificationMethod: [
            {
              id: `${did}#controller`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              blockchainAccountId: `${checksumAddr}@eip155:3`,
            },
          ],
          authentication: [`${did}#controller`],
        },
      })
    })

    it('resolves on rinkeby when configured', () => {
      const did = 'did:ethr:rinkeby:' + addr
      const ethr = getResolver({
        networks: [{ name: 'rinkeby', rpcUrl: 'https://rinkeby.infura.io/v3/6b734e0b04454df8a6ce234023c04f26' }],
      })
      const resolver = new Resolver(ethr)
      return expect(resolver.resolve(did)).resolves.toEqual({
        didDocumentMetadata: {},
        didResolutionMetadata: { contentType: 'application/did+ld+json' },
        didDocument: {
          '@context': [
            'https://www.w3.org/ns/did/v1',
            'https://identity.foundation/EcdsaSecp256k1RecoverySignature2020/lds-ecdsa-secp256k1-recovery2020-0.0.jsonld',
          ],
          id: did,
          verificationMethod: [
            {
              id: `${did}#controller`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              blockchainAccountId: `${checksumAddr}@eip155:4`,
            },
          ],
          authentication: [`${did}#controller`],
        },
      })
    })

    it('resolves on kovan when configured', () => {
      const did = 'did:ethr:kovan:' + addr
      const ethr = getResolver({
        networks: [{ name: 'kovan', rpcUrl: 'https://kovan.infura.io/v3/6b734e0b04454df8a6ce234023c04f26' }],
      })
      const resolver = new Resolver(ethr)
      return expect(resolver.resolve(did)).resolves.toEqual({
        didDocumentMetadata: {},
        didResolutionMetadata: { contentType: 'application/did+ld+json' },
        didDocument: {
          '@context': [
            'https://www.w3.org/ns/did/v1',
            'https://identity.foundation/EcdsaSecp256k1RecoverySignature2020/lds-ecdsa-secp256k1-recovery2020-0.0.jsonld',
          ],
          id: did,
          verificationMethod: [
            {
              id: `${did}#controller`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              blockchainAccountId: `${checksumAddr}@eip155:42`,
            },
          ],
          authentication: [`${did}#controller`],
        },
      })
    })

    it('resolves on rsk when configured', () => {
      const did = 'did:ethr:rsk:' + addr
      const ethr = getResolver({ networks: [{ name: 'rsk', rpcUrl: 'https://did.rsk.co:4444' }] })
      const resolver = new Resolver(ethr)
      return expect(resolver.resolve(did)).resolves.toEqual({
        didDocumentMetadata: {},
        didResolutionMetadata: { contentType: 'application/did+ld+json' },
        didDocument: {
          '@context': [
            'https://www.w3.org/ns/did/v1',
            'https://identity.foundation/EcdsaSecp256k1RecoverySignature2020/lds-ecdsa-secp256k1-recovery2020-0.0.jsonld',
          ],
          id: did,
          verificationMethod: [
            {
              id: `${did}#controller`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              blockchainAccountId: `${checksumAddr}@eip155:30`,
            },
          ],
          authentication: [`${did}#controller`],
        },
      })
    })

    it('resolves on rsk:testnet when configured', () => {
      const did = 'did:ethr:rsk:testnet:' + addr
      const ethr = getResolver({ networks: [{ name: 'rsk:testnet', rpcUrl: 'https://did.testnet.rsk.co:4444' }] })
      const resolver = new Resolver(ethr)
      return expect(resolver.resolve(did)).resolves.toEqual({
        didDocumentMetadata: {},
        didResolutionMetadata: { contentType: 'application/did+ld+json' },
        didDocument: {
          '@context': [
            'https://www.w3.org/ns/did/v1',
            'https://identity.foundation/EcdsaSecp256k1RecoverySignature2020/lds-ecdsa-secp256k1-recovery2020-0.0.jsonld',
          ],
          id: did,
          verificationMethod: [
            {
              id: `${did}#controller`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              blockchainAccountId: `${checksumAddr}@eip155:31`,
            },
          ],
          authentication: [`${did}#controller`],
        },
      })
    })

    it('resolves public key identifier on rsk when configured', async () => {
      const did = 'did:ethr:rsk:0x03fdd57adec3d438ea237fe46b33ee1e016eda6b585c3e27ea66686c2ea5358479'
      const ethr = getResolver({ networks: [{ name: 'rsk', rpcUrl: 'https://did.rsk.co:4444' }] })
      const resolver = new Resolver(ethr)
      const doc = await resolver.resolve(did)
      return expect(doc).toEqual({
        didDocumentMetadata: {},
        didResolutionMetadata: { contentType: 'application/did+ld+json' },
        didDocument: {
          '@context': [
            'https://www.w3.org/ns/did/v1',
            'https://identity.foundation/EcdsaSecp256k1RecoverySignature2020/lds-ecdsa-secp256k1-recovery2020-0.0.jsonld',
          ],
          id: did,
          verificationMethod: [
            {
              id: `${did}#controller`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              blockchainAccountId: '0xF3beAC30C498D9E26865F34fCAa57dBB935b0D74@eip155:30',
            },
            {
              id: `${did}#controllerKey`,
              type: 'EcdsaSecp256k1VerificationKey2019',
              controller: did,
              publicKeyHex: '0x03fdd57adec3d438ea237fe46b33ee1e016eda6b585c3e27ea66686c2ea5358479',
            },
          ],
          authentication: [`${did}#controller`, `${did}#controllerKey`],
        },
      })
    })

    it('throws on resolving unconfigured network', async () => {
      expect.assertions(1)
      const ethr = getResolver({ networks: [{ name: 'rsk', rpcUrl: 'https://did.rsk.co:4444' }] })
      const resolver = new Resolver(ethr)
      await expect(
        resolver.resolve('did:ethr:zrx:0x03fdd57adec3d438ea237fe46b33ee1e016eda6b585c3e27ea66686c2ea5358479')
      ).rejects.toThrowError('unknown_network: The DID resolver does not have a configuration for network: zrx')
    })
  })
})

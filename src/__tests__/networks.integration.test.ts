import { describe, it, expect } from 'vitest'
import { Resolver } from 'did-resolver'
import { getResolver } from '../resolver'
import { interpretIdentifier } from '../helpers'

describe('ethrResolver (alt-chains)', () => {
  const addr = '0xd0dbe9d3698738f899ccd8ee27ff2347a7faa4dd'
  const { address } = interpretIdentifier(addr)
  const checksumAddr = address

  describe('eth-networks', () => {
    it('resolves a real mainnet DID via publicnode', async () => {
      const did = 'did:ethr:0x096164268929e920a217a76965547dc44732bb13'
      const resolver = new Resolver(
        getResolver({ networks: [{ name: 'mainnet', rpcUrl: 'https://ethereum.publicnode.com' }] })
      )
      const result = await resolver.resolve(did)
      expect(result).toEqual({
        didDocumentMetadata: {
          versionId: '7813666',
          updated: '2019-05-23T03:44:12Z',
        },
        didResolutionMetadata: { contentType: 'application/did+ld+json' },
        didDocument: {
          '@context': expect.anything(),
          id: did,
          verificationMethod: [
            {
              id: `${did}#controller`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              blockchainAccountId: 'eip155:1:0x8A948fddD8dE92ba977D336a3655e1c73Ed379db',
            },
          ],
          authentication: [`${did}#controller`],
          assertionMethod: [`${did}#controller`],
        },
      })
    })

    it('resolves historical versionId on mainnet via publicnode', async () => {
      const did = 'did:ethr:0x096164268929e920a217a76965547dc44732bb13'
      const resolver = new Resolver(
        getResolver({ networks: [{ name: 'mainnet', rpcUrl: 'https://ethereum.publicnode.com' }] })
      )
      // versionId=7813665 is one block before the DIDOwnerChanged event at 7813666
      const result = await resolver.resolve(`${did}?versionId=7813665`)
      expect(result).toEqual({
        didDocumentMetadata: {
          versionId: '7049829',
          updated: '2019-01-11T20:27:32Z',
          nextVersionId: '7813666',
          nextUpdate: '2019-05-23T03:44:12Z',
        },
        didResolutionMetadata: { contentType: 'application/did+ld+json' },
        didDocument: {
          '@context': expect.anything(),
          id: did,
          verificationMethod: [
            {
              id: `${did}#controller`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              blockchainAccountId: 'eip155:1:0x8A948fddD8dE92ba977D336a3655e1c73Ed379db',
            },
          ],
          authentication: [`${did}#controller`],
          assertionMethod: [`${did}#controller`],
        },
      })
    })

    it('returns error when non-archive node silently drops historical logs', async () => {
      const did = 'did:ethr:0x096164268929e920a217a76965547dc44732bb13'
      const resolver = new Resolver(
        getResolver({ networks: [{ name: 'mainnet', rpcUrl: 'https://rpc.flashbots.net' }] })
      )
      const result = await resolver.resolve(did)
      // The flashbots.net RPC endpoint is not an archive node — it returns empty logs for old blocks.
      // The integrity check detects the missing events and returns an actionable error.
      expect(result.didDocument).toBeNull()
      expect(result.didResolutionMetadata.error).toBe('notFound')
      expect(result.didResolutionMetadata.message).toMatch(/archive node/)
    })

    it('resolves on mainnet with versionId', async () => {
      const resolver = new Resolver(getResolver({ infuraProjectId: '6b734e0b04454df8a6ce234023c04f26' }))
      const result = await resolver.resolve('did:ethr:0x26bf14321004e770e7a8b080b7a526d8eed8b388?versionId=12090174')
      expect(result).toEqual({
        didDocumentMetadata: {
          nextVersionId: '12090175',
          nextUpdate: '2021-03-22T18:14:29Z',
        },
        didResolutionMetadata: {
          contentType: 'application/did+ld+json',
        },
        didDocument: {
          '@context': expect.anything(),
          id: 'did:ethr:0x26bf14321004e770e7a8b080b7a526d8eed8b388',
          verificationMethod: [
            {
              id: 'did:ethr:0x26bf14321004e770e7a8b080b7a526d8eed8b388#controller',
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: 'did:ethr:0x26bf14321004e770e7a8b080b7a526d8eed8b388',
              blockchainAccountId: 'eip155:1:0x26bF14321004e770E7A8b080b7a526d8eed8b388',
            },
          ],
          authentication: ['did:ethr:0x26bf14321004e770e7a8b080b7a526d8eed8b388#controller'],
          assertionMethod: ['did:ethr:0x26bf14321004e770e7a8b080b7a526d8eed8b388#controller'],
        },
      })
    })

    it('resolves on sepolia when configured', async () => {
      const did = 'did:ethr:sepolia:' + addr
      const ethr = getResolver({
        infuraProjectId: '6b734e0b04454df8a6ce234023c04f26',
      })
      const resolver = new Resolver(ethr)
      const result = await resolver.resolve(did)
      expect(result).toEqual({
        didDocumentMetadata: {},
        didResolutionMetadata: { contentType: 'application/did+ld+json' },
        didDocument: {
          '@context': expect.anything(),
          id: did,
          verificationMethod: [
            {
              id: `${did}#controller`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              blockchainAccountId: `eip155:11155111:${checksumAddr}`,
            },
          ],
          authentication: [`${did}#controller`],
          assertionMethod: [`${did}#controller`],
        },
      })
    })

    // socket hangup
    it.skip('resolves on rsk when configured', async () => {
      const did = 'did:ethr:rsk:' + addr
      const ethr = getResolver({ networks: [{ name: 'rsk', rpcUrl: 'https://public-node.rsk.co' }] })
      const resolver = new Resolver(ethr)
      const result = await resolver.resolve(did)
      expect(result).toEqual({
        didDocumentMetadata: {},
        didResolutionMetadata: { contentType: 'application/did+ld+json' },
        didDocument: {
          '@context': expect.anything(),
          id: did,
          verificationMethod: [
            {
              id: `${did}#controller`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              blockchainAccountId: `eip155:30:${checksumAddr}`,
            },
          ],
          authentication: [`${did}#controller`],
          assertionMethod: [`${did}#controller`],
        },
      })
    })

    // socket hangup
    it.skip('resolves on rsk:testnet when configured', async () => {
      const did = 'did:ethr:rsk:testnet:' + addr
      const ethr = getResolver({ networks: [{ name: 'rsk:testnet', rpcUrl: 'https://public-node.testnet.rsk.co' }] })
      const resolver = new Resolver(ethr)
      const result = await resolver.resolve(did)
      expect(result).toEqual({
        didDocumentMetadata: {},
        didResolutionMetadata: { contentType: 'application/did+ld+json' },
        didDocument: {
          '@context': expect.anything(),
          id: did,
          verificationMethod: [
            {
              id: `${did}#controller`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              blockchainAccountId: `eip155:31:${checksumAddr}`,
            },
          ],
          authentication: [`${did}#controller`],
          assertionMethod: [`${did}#controller`],
        },
      })
    })

    it.skip('resolves public key identifier on rsk when configured', async () => {
      const did = 'did:ethr:rsk:0x03fdd57adec3d438ea237fe46b33ee1e016eda6b585c3e27ea66686c2ea5358479'
      const ethr = getResolver({ networks: [{ name: 'rsk', rpcUrl: 'https://did.rsk.co:4444' }] })
      const resolver = new Resolver(ethr)
      const doc = await resolver.resolve(did)
      return expect(doc).toEqual({
        didDocumentMetadata: {},
        didResolutionMetadata: { contentType: 'application/did+ld+json' },
        didDocument: {
          '@context': expect.anything(),
          id: did,
          verificationMethod: [
            {
              id: `${did}#controller`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              blockchainAccountId: 'eip155:30:0xF3beAC30C498D9E26865F34fCAa57dBB935b0D74',
            },
            {
              id: `${did}#controllerKey`,
              type: 'EcdsaSecp256k1VerificationKey2019',
              controller: did,
              publicKeyHex: '03fdd57adec3d438ea237fe46b33ee1e016eda6b585c3e27ea66686c2ea5358479',
            },
          ],
          authentication: [`${did}#controller`, `${did}#controllerKey`],
          assertionMethod: [`${did}#controller`, `${did}#controllerKey`],
        },
      })
    })

    it('resolves public keys and services on aurora when configured', async () => {
      const did = 'did:ethr:aurora:0x036d148205e34a8591dcdcea34fb7fed760f5f1eca66d254830833f755ff359ef0'
      const ethr = getResolver({
        networks: [
          {
            name: 'aurora',
            chainId: 1313161554,
            rpcUrl: 'https://mainnet.aurora.dev',
            registry: '0x63eD58B671EeD12Bc1652845ba5b2CDfBff198e0',
          },
        ],
      })
      const resolver = new Resolver(ethr)
      const doc = await resolver.resolve(did)
      return expect(doc).toEqual({
        didDocumentMetadata: {
          updated: '2022-01-19T12:20:00Z',
          versionId: '57702194',
        },
        didResolutionMetadata: { contentType: 'application/did+ld+json' },
        didDocument: {
          '@context': expect.anything(),
          id: did,
          verificationMethod: [
            {
              id: `${did}#controller`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              blockchainAccountId: 'eip155:1313161554:0x7a988202a04f00436f73972DF4dEfD80c3A6BD13',
            },
            {
              id: `${did}#controllerKey`,
              type: 'EcdsaSecp256k1VerificationKey2019',
              controller: did,
              publicKeyHex: '036d148205e34a8591dcdcea34fb7fed760f5f1eca66d254830833f755ff359ef0',
            },
          ],
          authentication: [`${did}#controller`, `${did}#controllerKey`],
          assertionMethod: [`${did}#controller`, `${did}#controllerKey`],
        },
      })
    })
  })
})

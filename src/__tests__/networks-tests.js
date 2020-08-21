import { Resolver } from 'did-resolver'
import { getResolver } from '../ethr-did-resolver'

describe('ethrResolver (alt-chains)', () => {
  let addr

  beforeAll(async () => {
    addr = '0xd0dbe9d3698738f899ccd8ee27ff2347a7faa4dd'
  })

  describe('eth-testnets', () => {
    it('resolves on ropsten when configured', () => {
      const did = 'did:ethr:ropsten:' + addr
      const ethr = getResolver({
        networks: [{ name: 'ropsten', rpcUrl: 'https://ropsten.infura.io/v3/6b734e0b04454df8a6ce234023c04f26' }]
      })
      const resolver = new Resolver(ethr)
      return expect(resolver.resolve(did)).resolves.toEqual({
        '@context': 'https://w3id.org/did/v1',
        id: did,
        publicKey: [
          {
            id: `${did}#owner`,
            type: 'Secp256k1VerificationKey2018',
            owner: did,
            ethereumAddress: addr
          }
        ],
        authentication: [
          {
            type: 'Secp256k1SignatureAuthentication2018',
            publicKey: `${did}#owner`
          }
        ]
      })
    })

    it('resolves on rinkeby when configured', () => {
      const did = 'did:ethr:rinkeby:' + addr
      const ethr = getResolver({
        networks: [{ name: 'rinkeby', rpcUrl: 'https://rinkeby.infura.io/v3/6b734e0b04454df8a6ce234023c04f26' }]
      })
      const resolver = new Resolver(ethr)
      return expect(resolver.resolve(did)).resolves.toEqual({
        '@context': 'https://w3id.org/did/v1',
        id: did,
        publicKey: [
          {
            id: `${did}#owner`,
            type: 'Secp256k1VerificationKey2018',
            owner: did,
            ethereumAddress: addr
          }
        ],
        authentication: [
          {
            type: 'Secp256k1SignatureAuthentication2018',
            publicKey: `${did}#owner`
          }
        ]
      })
    })

    it('resolves on kovan when configured', () => {
      const did = 'did:ethr:kovan:' + addr
      const ethr = getResolver({
        networks: [{ name: 'kovan', rpcUrl: 'https://kovan.infura.io/v3/6b734e0b04454df8a6ce234023c04f26' }]
      })
      const resolver = new Resolver(ethr)
      return expect(resolver.resolve(did)).resolves.toEqual({
        '@context': 'https://w3id.org/did/v1',
        id: did,
        publicKey: [
          {
            id: `${did}#owner`,
            type: 'Secp256k1VerificationKey2018',
            owner: did,
            ethereumAddress: addr
          }
        ],
        authentication: [
          {
            type: 'Secp256k1SignatureAuthentication2018',
            publicKey: `${did}#owner`
          }
        ]
      })
    })

    it('resolves on rsk when configured', () => {
      const did = 'did:ethr:rsk:' + addr
      const ethr = getResolver({ networks: [{ name: 'rsk', rpcUrl: 'https://did.rsk.co:4444' }] })
      const resolver = new Resolver(ethr)
      return expect(resolver.resolve(did)).resolves.toEqual({
        '@context': 'https://w3id.org/did/v1',
        id: did,
        publicKey: [
          {
            id: `${did}#owner`,
            type: 'Secp256k1VerificationKey2018',
            owner: did,
            ethereumAddress: addr
          }
        ],
        authentication: [
          {
            type: 'Secp256k1SignatureAuthentication2018',
            publicKey: `${did}#owner`
          }
        ]
      })
    })

    it('resolves on rsk:testnet when configured', () => {
      const did = 'did:ethr:rsk:testnet:' + addr
      const ethr = getResolver({ networks: [{ name: 'rsk:testnet', rpcUrl: 'https://did.testnet.rsk.co:4444' }] })
      const resolver = new Resolver(ethr)
      return expect(resolver.resolve(did)).resolves.toEqual({
        '@context': 'https://w3id.org/did/v1',
        id: did,
        publicKey: [
          {
            id: `${did}#owner`,
            type: 'Secp256k1VerificationKey2018',
            owner: did,
            ethereumAddress: addr
          }
        ],
        authentication: [
          {
            type: 'Secp256k1SignatureAuthentication2018',
            publicKey: `${did}#owner`
          }
        ]
      })
    })

    it('resolves public key identifier on rsk when configured', async () => {
      const did = 'did:ethr:rsk:0x03fdd57adec3d438ea237fe46b33ee1e016eda6b585c3e27ea66686c2ea5358479'
      const ethr = getResolver({ networks: [{ name: 'rsk', rpcUrl: 'https://did.rsk.co:4444' }] })
      const resolver = new Resolver(ethr)
      const doc = await resolver.resolve(did)
      return expect(doc).toEqual({
        '@context': 'https://w3id.org/did/v1',
        id: did,
        publicKey: [
          {
            id: `${did}#owner`,
            type: 'Secp256k1VerificationKey2018',
            owner: did,
            ethereumAddress: '0xf3beac30c498d9e26865f34fcaa57dbb935b0d74'
          },
          {
            id: `${did}#ownerKey`,
            type: 'Secp256k1VerificationKey2018',
            owner: did,
            publicKeyHex: '0x03fdd57adec3d438ea237fe46b33ee1e016eda6b585c3e27ea66686c2ea5358479'
          }
        ],
        authentication: [
          {
            type: 'Secp256k1SignatureAuthentication2018',
            publicKey: `${did}#owner`
          },
          {
            type: 'Secp256k1SignatureAuthentication2018',
            publicKey: `${did}#ownerKey`
          }
        ]
      })
    })
  })
})

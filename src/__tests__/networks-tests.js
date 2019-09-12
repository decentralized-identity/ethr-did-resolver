import { Resolver } from 'did-resolver'
import { getResolver } from '../ethr-did-resolver'

describe('ethrResolver (alt-chains)', () => {
  let addr, didResolver

  beforeAll(async () => {
    addr = '0xd0dbe9d3698738f899ccd8ee27ff2347a7faa4dd'
    const ethr = getResolver()
    didResolver = new Resolver(ethr)
  })

  describe('eth-testnets', () => {
    it('resolves on ropsten', () => {
      const did = 'did:ethr:ropsten:' + addr
      return expect(didResolver.resolve(did)).resolves.toEqual({
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

    it('resolves on rinkeby', () => {
      const did = 'did:ethr:rinkeby:' + addr
      return expect(didResolver.resolve(did)).resolves.toEqual({
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

    it('resolves on kovan', () => {
      const did = 'did:ethr:kovan:' + addr
      return expect(didResolver.resolve(did)).resolves.toEqual({
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

    it('resolves on rsk', () => {
      const did = 'did:ethr:rsk:' + addr
      return expect(didResolver.resolve(did)).resolves.toEqual({
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

    it.skip('resolves on rsk:testnet', () => {
      const did = 'did:ethr:rsk:testnet:' + addr
      return expect(didResolver.resolve(did)).resolves.toEqual({
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
  })
})

import resolve from 'did-resolver'
import register, { stringToBytes32, delegateTypes } from '../register'
import Contract from 'truffle-contract'
import DidRegistryContract from 'ethr-did-registry'
import Web3 from 'web3'
import ganache from 'ganache-cli'

const {
  Secp256k1SignatureAuthentication2018,
  Secp256k1VerificationKey2018,
} = delegateTypes

function sleep(seconds) {
  return new Promise((resolve, reject) => setTimeout(resolve, seconds * 1000))
}

describe('ethrResolver', () => {
  const provider = ganache.provider()
  // const provider = new Web3.providers.HttpProvider('http://127.0.0.1:7545')
  const DidReg = Contract(DidRegistryContract)
  const web3 = new Web3()
  web3.setProvider(provider)
  const getAccounts = () =>
    new Promise((resolve, reject) =>
      web3.eth.getAccounts(
        (error, accounts) => (error ? reject(error) : resolve(accounts))
      )
    )
  DidReg.setProvider(provider)

  const stopMining = () =>
    new Promise((resolve, reject) =>
      web3.currentProvider.send(
        {
          jsonrpc: '2.0',
          method: 'miner_stop',
          id: new Date().getTime(),
        },
        (e, val) => {
          if (e) reject(e)
          return resolve(val)
        }
      )
    )

  const startMining = () => {
    new Promise(async (resolve, reject) => {
      web3.currentProvider.send(
        {
          jsonrpc: '2.0',
          method: 'miner_start',
          params: [1],
          id: new Date().getTime(),
        },
        (e, val) => {
          if (e) reject(e)
          return resolve(val)
        }
      )
    })
  }

  let registry, accounts, did, identity, owner, delegate1, delegate2

  beforeAll(async () => {
    accounts = await getAccounts()
    identity = accounts[1]
    owner = accounts[2]
    delegate1 = accounts[3]
    delegate2 = accounts[4]
    did = `did:ethr:${identity}`

    registry = await DidReg.new({
      from: accounts[0],
      gasPrice: 100000000000,
      gas: 4712388, //1779962
    })
    register({ provider, registry: registry.address })
  })

  describe('unregistered', () => {
    it('resolves document', () => {
      return expect(resolve(did)).resolves.toEqual({
        '@context': 'https://w3id.org/did/v1',
        id: did,
        publicKey: [
          {
            id: `${did}#owner`,
            type: 'Secp256k1VerificationKey2018',
            owner: did,
            ethereumAddress: identity,
          },
        ],
        authentication: [
          {
            type: 'Secp256k1SignatureAuthentication2018',
            publicKey: `${did}#owner`,
          },
        ],
      })
    })
  })

  describe('owner changed', () => {
    beforeAll(async () => {
      await registry.changeOwner(identity, owner, { from: identity })
    })

    it('resolves document', () => {
      return expect(resolve(did)).resolves.toEqual({
        '@context': 'https://w3id.org/did/v1',
        id: did,
        publicKey: [
          {
            id: `${did}#owner`,
            type: 'Secp256k1VerificationKey2018',
            owner: did,
            ethereumAddress: owner,
          },
        ],
        authentication: [
          {
            type: 'Secp256k1SignatureAuthentication2018',
            publicKey: `${did}#owner`,
          },
        ],
      })
    })
  })

  describe('delegates', () => {
    describe('add signing delegate', () => {
      beforeAll(async () => {
        await registry.addDelegate(
          identity,
          Secp256k1VerificationKey2018,
          delegate1,
          2,
          { from: owner }
        )
      })

      it('resolves document', () => {
        return expect(resolve(did)).resolves.toEqual({
          '@context': 'https://w3id.org/did/v1',
          id: did,
          publicKey: [
            {
              id: `${did}#owner`,
              type: 'Secp256k1VerificationKey2018',
              owner: did,
              ethereumAddress: owner,
            },
            {
              id: `${did}#delegate-1`,
              type: 'Secp256k1VerificationKey2018',
              owner: did,
              ethereumAddress: delegate1,
            },
          ],
          authentication: [
            {
              type: 'Secp256k1SignatureAuthentication2018',
              publicKey: `${did}#owner`,
            },
          ],
        })
      })
    })

    describe('add auth delegate', () => {
      beforeAll(async () => {
        await registry.addDelegate(
          identity,
          Secp256k1SignatureAuthentication2018,
          delegate2,
          10,
          { from: owner }
        )
      })

      it('resolves document', () => {
        return expect(resolve(did)).resolves.toEqual({
          '@context': 'https://w3id.org/did/v1',
          id: did,
          publicKey: [
            {
              id: `${did}#owner`,
              type: 'Secp256k1VerificationKey2018',
              owner: did,
              ethereumAddress: owner,
            },
            {
              id: `${did}#delegate-1`,
              type: 'Secp256k1VerificationKey2018',
              owner: did,
              ethereumAddress: delegate1,
            },
            {
              id: `${did}#delegate-2`,
              type: 'Secp256k1VerificationKey2018',
              owner: did,
              ethereumAddress: delegate2,
            },
          ],
          authentication: [
            {
              type: 'Secp256k1SignatureAuthentication2018',
              publicKey: `${did}#owner`,
            },
            {
              type: 'Secp256k1SignatureAuthentication2018',
              publicKey: `${did}#delegate-2`,
            },
          ],
        })
      })
    })

    describe('expire automatically', () => {
      beforeAll(async () => {
        await sleep(3)
      })

      it('resolves document', () => {
        return expect(resolve(did)).resolves.toEqual({
          '@context': 'https://w3id.org/did/v1',
          id: did,
          publicKey: [
            {
              id: `${did}#owner`,
              type: 'Secp256k1VerificationKey2018',
              owner: did,
              ethereumAddress: owner,
            },
            {
              id: `${did}#delegate-1`,
              type: 'Secp256k1VerificationKey2018',
              owner: did,
              ethereumAddress: delegate2,
            },
          ],
          authentication: [
            {
              type: 'Secp256k1SignatureAuthentication2018',
              publicKey: `${did}#owner`,
            },
            {
              type: 'Secp256k1SignatureAuthentication2018',
              publicKey: `${did}#delegate-1`,
            },
          ],
        })
      })
    })

    describe('revokes delegate', () => {
      beforeAll(async () => {
        await registry.revokeDelegate(
          identity,
          Secp256k1SignatureAuthentication2018,
          delegate2,
          { from: owner }
        )
        await sleep(1)
      })

      it('resolves document', () => {
        return expect(resolve(did)).resolves.toEqual({
          '@context': 'https://w3id.org/did/v1',
          id: did,
          publicKey: [
            {
              id: `${did}#owner`,
              type: 'Secp256k1VerificationKey2018',
              owner: did,
              ethereumAddress: owner,
            },
          ],
          authentication: [
            {
              type: 'Secp256k1SignatureAuthentication2018',
              publicKey: `${did}#owner`,
            },
          ],
        })
      })
    })

    describe('re-add auth delegate', () => {
      beforeAll(async () => {
        await sleep(3)
        await registry.addDelegate(
          identity,
          Secp256k1SignatureAuthentication2018,
          delegate2,
          86400,
          { from: owner }
        )
      })

      it('resolves document', () => {
        return expect(resolve(did)).resolves.toEqual({
          '@context': 'https://w3id.org/did/v1',
          id: did,
          publicKey: [
            {
              id: `${did}#owner`,
              type: 'Secp256k1VerificationKey2018',
              owner: did,
              ethereumAddress: owner,
            },
            {
              id: `${did}#delegate-1`,
              type: 'Secp256k1VerificationKey2018',
              owner: did,
              ethereumAddress: delegate2,
            },
          ],
          authentication: [
            {
              type: 'Secp256k1SignatureAuthentication2018',
              publicKey: `${did}#owner`,
            },
            {
              type: 'Secp256k1SignatureAuthentication2018',
              publicKey: `${did}#delegate-1`,
            },
          ],
        })
      })
    })
  })

  describe('attributes', () => {
    describe('add publicKey', () => {
      describe('Secp256k1VerificationKey2018', () => {
        beforeAll(async () => {
          await registry.setAttribute(
            identity,
            stringToBytes32('did/pub/Secp256k1/veriKey'),
            '0x02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
            10,
            { from: owner }
          )
        })
        it('resolves document', () => {
          return expect(resolve(did)).resolves.toEqual({
            '@context': 'https://w3id.org/did/v1',
            id: did,
            publicKey: [
              {
                id: `${did}#owner`,
                type: 'Secp256k1VerificationKey2018',
                owner: did,
                ethereumAddress: owner,
              },
              {
                id: `${did}#delegate-1`,
                type: 'Secp256k1VerificationKey2018',
                owner: did,
                ethereumAddress: delegate2,
              },
              {
                id: `${did}#delegate-2`,
                type: 'Secp256k1VerificationKey2018',
                owner: did,
                publicKeyHex:
                  '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
              },
            ],
            authentication: [
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#owner`,
              },
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#delegate-1`,
              },
            ],
          })
        })
      })

      describe('Ed25519VerificationKey2018', () => {
        beforeAll(async () => {
          await registry.setAttribute(
            identity,
            stringToBytes32('did/pub/Ed25519/veriKey/base64'),
            '0x02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
            10,
            { from: owner }
          )
        })

        it('resolves document', () => {
          return expect(resolve(did)).resolves.toEqual({
            '@context': 'https://w3id.org/did/v1',
            id: did,
            publicKey: [
              {
                id: `${did}#owner`,
                type: 'Secp256k1VerificationKey2018',
                owner: did,
                ethereumAddress: owner,
              },
              {
                id: `${did}#delegate-1`,
                type: 'Secp256k1VerificationKey2018',
                owner: did,
                ethereumAddress: delegate2,
              },
              {
                id: `${did}#delegate-2`,
                type: 'Secp256k1VerificationKey2018',
                owner: did,
                publicKeyHex:
                  '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
              },
              {
                id: `${did}#delegate-3`,
                type: 'Ed25519VerificationKey2018',
                owner: did,
                publicKeyBase64: Buffer.from(
                  '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
                  'hex'
                ).toString('base64'),
              },
            ],
            authentication: [
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#owner`,
              },
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#delegate-1`,
              },
            ],
          })
        })
      })
    })

    describe('add service endpoints', () => {
      describe('HubService', () => {
        beforeAll(async () => {
          await registry.setAttribute(
            identity,
            stringToBytes32('did/svc/HubService'),
            'https://hubs.uport.me',
            10,
            { from: owner }
          )
        })
        it('resolves document', () => {
          return expect(resolve(did)).resolves.toEqual({
            '@context': 'https://w3id.org/did/v1',
            id: did,
            publicKey: [
              {
                id: `${did}#owner`,
                type: 'Secp256k1VerificationKey2018',
                owner: did,
                ethereumAddress: owner,
              },
              {
                id: `${did}#delegate-1`,
                type: 'Secp256k1VerificationKey2018',
                owner: did,
                ethereumAddress: delegate2,
              },
              {
                id: `${did}#delegate-2`,
                type: 'Secp256k1VerificationKey2018',
                owner: did,
                publicKeyHex:
                  '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
              },
              {
                id: `${did}#delegate-3`,
                type: 'Ed25519VerificationKey2018',
                owner: did,
                publicKeyBase64: Buffer.from(
                  '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
                  'hex'
                ).toString('base64'),
              },
            ],
            authentication: [
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#owner`,
              },
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#delegate-1`,
              },
            ],
            service: [
              {
                type: 'HubService',
                serviceEndpoint: 'https://hubs.uport.me',
              },
            ],
          })
        })
      })
    })

    describe('revoke publicKey', () => {
      describe('Secp256k1VerificationKey2018', () => {
        beforeAll(async () => {
          await registry.revokeAttribute(
            identity,
            stringToBytes32('did/pub/Secp256k1/veriKey'),
            '0x02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
            { from: owner }
          )
          sleep(1)
        })
        it('resolves document', () => {
          return expect(resolve(did)).resolves.toEqual({
            '@context': 'https://w3id.org/did/v1',
            id: did,
            publicKey: [
              {
                id: `${did}#owner`,
                type: 'Secp256k1VerificationKey2018',
                owner: did,
                ethereumAddress: owner,
              },
              {
                id: `${did}#delegate-1`,
                type: 'Secp256k1VerificationKey2018',
                owner: did,
                ethereumAddress: delegate2,
              },
              {
                id: `${did}#delegate-3`,
                type: 'Ed25519VerificationKey2018',
                owner: did,
                publicKeyBase64: Buffer.from(
                  '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
                  'hex'
                ).toString('base64'),
              },
            ],
            authentication: [
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#owner`,
              },
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#delegate-1`,
              },
            ],
            service: [
              {
                type: 'HubService',
                serviceEndpoint: 'https://hubs.uport.me',
              },
            ],
          })
        })
      })

      describe('Ed25519VerificationKey2018', () => {
        beforeAll(async () => {
          await registry.revokeAttribute(
            identity,
            stringToBytes32('did/pub/Ed25519/veriKey/base64'),
            '0x02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
            { from: owner }
          )
          sleep(1)
        })
        it('resolves document', () => {
          return expect(resolve(did)).resolves.toEqual({
            '@context': 'https://w3id.org/did/v1',
            id: did,
            publicKey: [
              {
                id: `${did}#owner`,
                type: 'Secp256k1VerificationKey2018',
                owner: did,
                ethereumAddress: owner,
              },
              {
                id: `${did}#delegate-1`,
                type: 'Secp256k1VerificationKey2018',
                owner: did,
                ethereumAddress: delegate2,
              },
            ],
            authentication: [
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#owner`,
              },
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#delegate-1`,
              },
            ],
            service: [
              {
                type: 'HubService',
                serviceEndpoint: 'https://hubs.uport.me',
              },
            ],
          })
        })
      })
    })

    describe('revoke service endpoints', () => {
      describe('HubService', () => {
        beforeAll(async () => {
          await registry.revokeAttribute(
            identity,
            stringToBytes32('did/svc/HubService'),
            'https://hubs.uport.me',
            { from: owner }
          )
          sleep(1)
        })

        it('resolves document', () => {
          return expect(resolve(did)).resolves.toEqual({
            '@context': 'https://w3id.org/did/v1',
            id: did,
            publicKey: [
              {
                id: `${did}#owner`,
                type: 'Secp256k1VerificationKey2018',
                owner: did,
                ethereumAddress: owner,
              },
              {
                id: `${did}#delegate-1`,
                type: 'Secp256k1VerificationKey2018',
                owner: did,
                ethereumAddress: delegate2,
              },
            ],
            authentication: [
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#owner`,
              },
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#delegate-1`,
              },
            ],
          })
        })
      })
    })
  })

  describe('multiple events in one block', () => {
    beforeAll(async () => {
      await stopMining()
      await Promise.all([
        registry.setAttribute(
          identity,
          stringToBytes32('did/svc/TestService'),
          'https://test.uport.me',
          10,
          { from: owner }
        ),
        registry.setAttribute(
          identity,
          stringToBytes32('did/svc/TestService'),
          'https://test.uport.me',
          10,
          { from: owner }
        ),
        sleep(1).then(() => startMining()),
      ])
    })

    it('resolves document', async () => {
      expect(await resolve(did)).toEqual({
        '@context': 'https://w3id.org/did/v1',
        id: did,
        publicKey: [
          {
            id: `${did}#owner`,
            type: 'Secp256k1VerificationKey2018',
            owner: did,
            ethereumAddress: owner,
          },
          {
            id: `${did}#delegate-1`,
            type: 'Secp256k1VerificationKey2018',
            owner: did,
            ethereumAddress: delegate2,
          },
        ],
        authentication: [
          {
            type: 'Secp256k1SignatureAuthentication2018',
            publicKey: `${did}#owner`,
          },
          {
            type: 'Secp256k1SignatureAuthentication2018',
            publicKey: `${did}#delegate-1`,
          },
        ],
        service: [
          {
            type: 'TestService',
            serviceEndpoint: 'https://test.uport.me',
          },
        ],
      })
    })
  })

  describe('error handling', () => {
    it('rejects promise', () => {
      return expect(
        resolve('did:ethr:2nQtiQG6Cgm1GYTBaaKAgr76uY7iSexUkqX')
      ).rejects.toEqual(
        new Error(
          'Not a valid ethr DID: did:ethr:2nQtiQG6Cgm1GYTBaaKAgr76uY7iSexUkqX'
        )
      )
    })
  })
})

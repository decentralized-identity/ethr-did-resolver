import { Resolver } from 'did-resolver'
import { getResolver, stringToBytes32, delegateTypes } from '../ethr-did-resolver'
import Contract from 'truffle-contract'
import DidRegistryContract from 'ethr-did-registry'
import Web3 from 'web3'
import ganache from 'ganache-cli'

const { Secp256k1SignatureAuthentication2018, Secp256k1VerificationKey2018 } = delegateTypes

function sleep(seconds) {
  return new Promise((resolve, reject) => setTimeout(resolve, seconds * 1000))
}

describe('ethrResolver', () => {
  const provider = ganache.provider({
    accounts: [
      {
        secretKey: '0x278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f',
        //  address: '0xf3beac30c498d9e26865f34fcaa57dbb935b0d74',
        //  publicKey: '03fdd57adec3d438ea237fe46b33ee1e016eda6b585c3e27ea66686c2ea5358479'
        balance: '0x1000000000000000000'
      },
      {
        secretKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
        //  address: '0x7e5f4552091a69125d5dfcb7b8c2659029395bdf',
        //  publicKey: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
        balance: '0x1000000000000000000'
      },
      {
        secretKey: '0x0000000000000000000000000000000000000000000000000000000000000002',
        //  address: '0x2b5ad5c4795c026514f8317c7a215e218dccd6cf',
        //  publicKey: '02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5'
        balance: '0x1000000000000000000'
      },
      {
        secretKey: '0x0000000000000000000000000000000000000000000000000000000000000003',
        //  address: '0x6813eb9362372eef6200f3b1dbc3f819671cba69',
        //  publicKey: '02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9'
        balance: '0x1000000000000000000'
      },
      {
        secretKey: '0x0000000000000000000000000000000000000000000000000000000000000004',
        //  address: '0x1eff47bc3a10a45d4b230b5d10e37751fe6aa718',
        //  publicKey: '02e493dbf1c10d80f3581e4904930b1404cc6c13900ee0758474fa94abe8c4cd13'
        balance: '0x1000000000000000000'
      },
      {
        secretKey: '0x0000000000000000000000000000000000000000000000000000000000000005',
        //  address: '0xe1ab8145f7e55dc933d51a18c793f901a3a0b276'
        //  publicKey: '022f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4'
        balance: '0x1000000000000000000'
      }
    ]
  })
  // const provider = new Web3.providers.HttpProvider('http://127.0.0.1:7545')
  const DidReg = Contract(DidRegistryContract)
  const web3 = new Web3()
  web3.setProvider(provider)
  const getAccounts = () =>
    new Promise((resolve, reject) =>
      web3.eth.getAccounts((error, accounts) => (error ? reject(error) : resolve(accounts)))
    )
  DidReg.setProvider(provider)

  const stopMining = () =>
    new Promise((resolve, reject) =>
      web3.currentProvider.send(
        {
          jsonrpc: '2.0',
          method: 'miner_stop',
          id: new Date().getTime()
        },
        (e, val) => {
          if (e) reject(e)
          return resolve(val)
        }
      )
    )

  const startMining = () => {
    return new Promise((resolve, reject) =>
      web3.currentProvider.send(
        {
          jsonrpc: '2.0',
          method: 'miner_start',
          params: [1],
          id: new Date().getTime()
        },
        (e, val) => {
          if (e) reject(e)
          return resolve(val)
        }
      )
    )
  }

  let registry, accounts, did, identity, controller, delegate1, delegate2, ethr, didResolver, aka1, aka2

  beforeAll(async () => {
    accounts = await getAccounts()
    identity = accounts[1]
    controller = accounts[2]
    delegate1 = accounts[3]
    delegate2 = accounts[4]
    did = `did:ethr:${identity}`
    aka1 = `did:ethr:rinkeby:${identity}`
    aka2 = `did:ethr:ropsten:${identity}`

    registry = await DidReg.new({
      from: accounts[0],
      gasPrice: 100000000000,
      gas: 4712388 // 1779962
    })
    ethr = getResolver({ provider, registry: registry.address })
    didResolver = new Resolver(ethr)
  })

  describe('unregistered', () => {
    it('resolves document', () => {
      return expect(didResolver.resolve(did)).resolves.toEqual({
        '@context': 'https://w3id.org/did/v1',
        id: did,
        publicKey: [
          {
            id: `${did}#controller`,
            type: 'Secp256k1VerificationKey2018',
            controller: did,
            ethereumAddress: identity
          }
        ],
        authentication: [
          {
            type: 'Secp256k1SignatureAuthentication2018',
            publicKey: `${did}#controller`
          }
        ]
      })
    })

    it('resolves document with publicKey identifier', () => {
      const pubKey = '0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
      const pubdid = `did:ethr:${pubKey}`
      return expect(didResolver.resolve(pubdid)).resolves.toEqual({
        '@context': 'https://w3id.org/did/v1',
        id: pubdid,
        publicKey: [
          {
            id: `${pubdid}#controller`,
            type: 'Secp256k1VerificationKey2018',
            controller: pubdid,
            ethereumAddress: identity
          },
          {
            id: `${pubdid}#controllerKey`,
            type: 'Secp256k1VerificationKey2018',
            controller: pubdid,
            publicKeyHex: pubKey
          }
        ],
        authentication: [
          {
            type: 'Secp256k1SignatureAuthentication2018',
            publicKey: `${pubdid}#controller`
          },
          {
            type: 'Secp256k1SignatureAuthentication2018',
            publicKey: `${pubdid}#controllerKey`
          }
        ]
      })
    })
  })

  describe('controller changed', () => {
    beforeAll(async () => {
      await registry.changeOwner(identity, controller, { from: identity })
    })

    it('resolves document', () => {
      return expect(didResolver.resolve(did)).resolves.toEqual({
        '@context': 'https://w3id.org/did/v1',
        id: did,
        publicKey: [
          {
            id: `${did}#controller`,
            type: 'Secp256k1VerificationKey2018',
            controller: did,
            ethereumAddress: controller
          }
        ],
        authentication: [
          {
            type: 'Secp256k1SignatureAuthentication2018',
            publicKey: `${did}#controller`
          }
        ]
      })
    })

    it('changing controller invalidates the publicKey as identifier', async () => {
      const pubKey = '0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
      const pubdid = `did:ethr:${pubKey}`
      const doc = await didResolver.resolve(pubdid)
      expect(doc).toEqual({
        '@context': 'https://w3id.org/did/v1',
        id: pubdid,
        publicKey: [
          {
            id: `${pubdid}#controller`,
            type: 'Secp256k1VerificationKey2018',
            controller: pubdid,
            ethereumAddress: controller
          }
        ],
        authentication: [
          {
            type: 'Secp256k1SignatureAuthentication2018',
            publicKey: `${pubdid}#controller`
          }
        ]
      })
      expect(doc.publicKey.length).toBe(1)
      expect(doc.authentication.length).toBe(1)
    })
  })

  describe('delegates', () => {
    describe('add signing delegate', () => {
      beforeAll(async () => {
        await registry.addDelegate(identity, Secp256k1VerificationKey2018, delegate1, 2, { from: controller })
      })

      it('resolves document', () => {
        return expect(didResolver.resolve(did)).resolves.toEqual({
          '@context': 'https://w3id.org/did/v1',
          id: did,
          publicKey: [
            {
              id: `${did}#controller`,
              type: 'Secp256k1VerificationKey2018',
              controller: did,
              ethereumAddress: controller
            },
            {
              id: `${did}#delegate-1`,
              type: 'Secp256k1VerificationKey2018',
              controller: did,
              ethereumAddress: delegate1
            }
          ],
          authentication: [
            {
              type: 'Secp256k1SignatureAuthentication2018',
              publicKey: `${did}#controller`
            }
          ]
        })
      })
    })

    describe('add auth delegate', () => {
      beforeAll(async () => {
        await registry.addDelegate(identity, Secp256k1SignatureAuthentication2018, delegate2, 10, { from: controller })
      })

      it('resolves document', () => {
        return expect(didResolver.resolve(did)).resolves.toEqual({
          '@context': 'https://w3id.org/did/v1',
          id: did,
          publicKey: [
            {
              id: `${did}#controller`,
              type: 'Secp256k1VerificationKey2018',
              controller: did,
              ethereumAddress: controller
            },
            {
              id: `${did}#delegate-1`,
              type: 'Secp256k1VerificationKey2018',
              controller: did,
              ethereumAddress: delegate1
            },
            {
              id: `${did}#delegate-2`,
              type: 'Secp256k1VerificationKey2018',
              controller: did,
              ethereumAddress: delegate2
            }
          ],
          authentication: [
            {
              type: 'Secp256k1SignatureAuthentication2018',
              publicKey: `${did}#controller`
            },
            {
              type: 'Secp256k1SignatureAuthentication2018',
              publicKey: `${did}#delegate-2`
            }
          ]
        })
      })
    })

    describe('expire automatically', () => {
      beforeAll(async () => {
        await sleep(3)
      })

      it('resolves document', () => {
        return expect(didResolver.resolve(did)).resolves.toEqual({
          '@context': 'https://w3id.org/did/v1',
          id: did,
          publicKey: [
            {
              id: `${did}#controller`,
              type: 'Secp256k1VerificationKey2018',
              controller: did,
              ethereumAddress: controller
            },
            {
              id: `${did}#delegate-1`,
              type: 'Secp256k1VerificationKey2018',
              controller: did,
              ethereumAddress: delegate2
            }
          ],
          authentication: [
            {
              type: 'Secp256k1SignatureAuthentication2018',
              publicKey: `${did}#controller`
            },
            {
              type: 'Secp256k1SignatureAuthentication2018',
              publicKey: `${did}#delegate-1`
            }
          ]
        })
      })
    })

    describe('revokes delegate', () => {
      beforeAll(async () => {
        await registry.revokeDelegate(identity, Secp256k1SignatureAuthentication2018, delegate2, { from: controller })
        await sleep(1)
      })

      it('resolves document', () => {
        return expect(didResolver.resolve(did)).resolves.toEqual({
          '@context': 'https://w3id.org/did/v1',
          id: did,
          publicKey: [
            {
              id: `${did}#controller`,
              type: 'Secp256k1VerificationKey2018',
              controller: did,
              ethereumAddress: controller
            }
          ],
          authentication: [
            {
              type: 'Secp256k1SignatureAuthentication2018',
              publicKey: `${did}#controller`
            }
          ]
        })
      })
    })

    describe('re-add auth delegate', () => {
      beforeAll(async () => {
        await sleep(3)
        await registry.addDelegate(identity, Secp256k1SignatureAuthentication2018, delegate2, 86400, { from: controller })
      })

      it('resolves document', () => {
        return expect(didResolver.resolve(did)).resolves.toEqual({
          '@context': 'https://w3id.org/did/v1',
          id: did,
          publicKey: [
            {
              id: `${did}#controller`,
              type: 'Secp256k1VerificationKey2018',
              controller: did,
              ethereumAddress: controller
            },
            {
              id: `${did}#delegate-1`,
              type: 'Secp256k1VerificationKey2018',
              controller: did,
              ethereumAddress: delegate2
            }
          ],
          authentication: [
            {
              type: 'Secp256k1SignatureAuthentication2018',
              publicKey: `${did}#controller`
            },
            {
              type: 'Secp256k1SignatureAuthentication2018',
              publicKey: `${did}#delegate-1`
            }
          ]
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
            { from: controller }
          )
        })
        it('resolves document', () => {
          return expect(didResolver.resolve(did)).resolves.toEqual({
            '@context': 'https://w3id.org/did/v1',
            id: did,
            publicKey: [
              {
                id: `${did}#controller`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                ethereumAddress: controller
              },
              {
                id: `${did}#delegate-1`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                ethereumAddress: delegate2
              },
              {
                id: `${did}#delegate-2`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                publicKeyHex: '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71'
              }
            ],
            authentication: [
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#controller`
              },
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#delegate-1`
              }
            ]
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
            { from: controller }
          )
        })

        it('resolves document', () => {
          return expect(didResolver.resolve(did)).resolves.toEqual({
            '@context': 'https://w3id.org/did/v1',
            id: did,
            publicKey: [
              {
                id: `${did}#controller`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                ethereumAddress: controller
              },
              {
                id: `${did}#delegate-1`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                ethereumAddress: delegate2
              },
              {
                id: `${did}#delegate-2`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                publicKeyHex: '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71'
              },
              {
                id: `${did}#delegate-3`,
                type: 'Ed25519VerificationKey2018',
                controller: did,
                publicKeyBase64: Buffer.from(
                  '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
                  'hex'
                ).toString('base64')
              }
            ],
            authentication: [
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#controller`
              },
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#delegate-1`
              }
            ]
          })
        })
      })

      describe('RSAVerificationKey2018', () => {
        beforeAll(async () => {
          await registry.setAttribute(
            identity,
            stringToBytes32('did/pub/RSA/veriKey/pem'),
            '-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n',
            10,
            { from: controller }
          )
        })

        it('resolves document', () => {
          return expect(didResolver.resolve(did)).resolves.toEqual({
            '@context': 'https://w3id.org/did/v1',
            id: did,
            publicKey: [
              {
                id: `${did}#controller`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                ethereumAddress: controller
              },
              {
                id: `${did}#delegate-1`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                ethereumAddress: delegate2
              },
              {
                id: `${did}#delegate-2`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                publicKeyHex: '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71'
              },
              {
                id: `${did}#delegate-3`,
                type: 'Ed25519VerificationKey2018',
                controller: did,
                publicKeyBase64: Buffer.from(
                  '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
                  'hex'
                ).toString('base64')
              },
              {
                id: `${did}#delegate-4`,
                type: 'RSAVerificationKey2018',
                controller: did,
                publicKeyPem: '-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n'
              }
            ],
            authentication: [
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#controller`
              },
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#delegate-1`
              }
            ]
          })
        })
      })

      describe('X25519KeyAgreementKey2019', () => {
        let identity1, did1

        beforeAll(async () => {
          const accounts = await getAccounts()
          identity1 = accounts[5]
          did1 = `did:ethr:${identity1}`

          await registry.setAttribute(
            identity1,
            stringToBytes32('did/pub/X25519/enc/base64'),
            `0x${Buffer.from('MCowBQYDK2VuAyEAEYVXd3/7B4d0NxpSsA/tdVYdz5deYcR1U+ZkphdmEFI=', 'base64').toString(
              'hex'
            )}`,
            86400,
            { from: identity1 }
          )
        })

        it('resolves document', () => {
          return expect(didResolver.resolve(did1)).resolves.toEqual({
            '@context': 'https://w3id.org/did/v1',
            id: did1,
            publicKey: [
              {
                id: `${did1}#controller`,
                type: 'Secp256k1VerificationKey2018',
                controller: did1,
                ethereumAddress: identity1
              },
              {
                id: `${did1}#delegate-1`,
                type: 'X25519KeyAgreementKey2019',
                controller: did1,
                publicKeyBase64: 'MCowBQYDK2VuAyEAEYVXd3/7B4d0NxpSsA/tdVYdz5deYcR1U+ZkphdmEFI='
              }
            ],
            authentication: [
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did1}#controller`
              }
            ]
          })
        })
      })
    })

    describe('add service endpoints', () => {
      describe('HubService', () => {
        beforeAll(async () => {
          await registry.setAttribute(identity, stringToBytes32('did/svc/HubService'), 'https://hubs.uport.me', 10, {
            from: controller
          })
        })
        it('resolves document', () => {
          return expect(didResolver.resolve(did)).resolves.toEqual({
            '@context': 'https://w3id.org/did/v1',
            id: did,
            publicKey: [
              {
                id: `${did}#controller`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                ethereumAddress: controller
              },
              {
                id: `${did}#delegate-1`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                ethereumAddress: delegate2
              },
              {
                id: `${did}#delegate-2`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                publicKeyHex: '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71'
              },
              {
                id: `${did}#delegate-3`,
                type: 'Ed25519VerificationKey2018',
                controller: did,
                publicKeyBase64: Buffer.from(
                  '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
                  'hex'
                ).toString('base64')
              },
              {
                id: `${did}#delegate-4`,
                type: 'RSAVerificationKey2018',
                controller: did,
                publicKeyPem: '-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n'
              }
            ],
            authentication: [
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#controller`
              },
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#delegate-1`
              }
            ],
            service: [
              {
                type: 'HubService',
                serviceEndpoint: 'https://hubs.uport.me'
              }
            ]
          })
        })
      })
    })

    describe('add alsoKnownAs', () => {
      describe('aka1', () => {
        beforeAll(async () => {
          await registry.setAttribute(identity, stringToBytes32('did/alsoKnownAs'), aka1, 10, {
            from: controller
          })
        })
        it('resolves document', () => {
          return expect(didResolver.resolve(did)).resolves.toEqual({
            '@context': 'https://w3id.org/did/v1',
            id: did,
            alsoKnownAs: [aka1],
            publicKey: [
              {
                id: `${did}#controller`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                ethereumAddress: controller
              },
              {
                id: `${did}#delegate-1`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                ethereumAddress: delegate2
              },
              {
                id: `${did}#delegate-2`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                publicKeyHex: '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71'
              },
              {
                id: `${did}#delegate-3`,
                type: 'Ed25519VerificationKey2018',
                controller: did,
                publicKeyBase64: Buffer.from(
                  '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
                  'hex'
                ).toString('base64')
              },
              {
                id: `${did}#delegate-4`,
                type: 'RSAVerificationKey2018',
                controller: did,
                publicKeyPem: '-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n'
              }
            ],
            authentication: [
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#controller`
              },
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#delegate-1`
              }
            ],
            service: [
              {
                type: 'HubService',
                serviceEndpoint: 'https://hubs.uport.me'
              }
            ]
          })
        })
      })

      describe('aka2 (twice)', () => {
        beforeAll(async () => {
          await Promise.all([
            registry.setAttribute(identity, stringToBytes32('did/alsoKnownAs'), aka2, 10, {
              from: controller
            }),
            registry.setAttribute(identity, stringToBytes32('did/alsoKnownAs'), aka2, 10, {
              from: controller
            })
          ])
        })
        it('resolves document', () => {
          return expect(didResolver.resolve(did)).resolves.toEqual({
            '@context': 'https://w3id.org/did/v1',
            id: did,
            alsoKnownAs: [aka1, aka2],
            publicKey: [
              {
                id: `${did}#controller`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                ethereumAddress: controller
              },
              {
                id: `${did}#delegate-1`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                ethereumAddress: delegate2
              },
              {
                id: `${did}#delegate-2`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                publicKeyHex: '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71'
              },
              {
                id: `${did}#delegate-3`,
                type: 'Ed25519VerificationKey2018',
                controller: did,
                publicKeyBase64: Buffer.from(
                  '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
                  'hex'
                ).toString('base64')
              },
              {
                id: `${did}#delegate-4`,
                type: 'RSAVerificationKey2018',
                controller: did,
                publicKeyPem: '-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n'
              }
            ],
            authentication: [
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#controller`
              },
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#delegate-1`
              }
            ],
            service: [
              {
                type: 'HubService',
                serviceEndpoint: 'https://hubs.uport.me'
              }
            ]
          })
        })
      })
    })

    describe('revoke alsoKnownAs', () => {
      describe('aka1 + aka2', () => {
        beforeAll(async () => {
          await Promise.all([
            registry.setAttribute(identity, stringToBytes32('did/alsoKnownAs'), aka1, 10, {
              from: controller
            }),
            registry.setAttribute(identity, stringToBytes32('did/alsoKnownAs'), aka2, 10, {
              from: controller
            })
          ])
        })
        it('resolves document', () => {
          return expect(didResolver.resolve(did)).resolves.toEqual({
            '@context': 'https://w3id.org/did/v1',
            id: did,
            publicKey: [
              {
                id: `${did}#controller`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                ethereumAddress: controller
              },
              {
                id: `${did}#delegate-1`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                ethereumAddress: delegate2
              },
              {
                id: `${did}#delegate-2`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                publicKeyHex: '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71'
              },
              {
                id: `${did}#delegate-3`,
                type: 'Ed25519VerificationKey2018',
                controller: did,
                publicKeyBase64: Buffer.from(
                  '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
                  'hex'
                ).toString('base64')
              },
              {
                id: `${did}#delegate-4`,
                type: 'RSAVerificationKey2018',
                controller: did,
                publicKeyPem: '-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n'
              }
            ],
            authentication: [
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#controller`
              },
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#delegate-1`
              }
            ],
            service: [
              {
                type: 'HubService',
                serviceEndpoint: 'https://hubs.uport.me'
              }
            ]
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
            { from: controller }
          )
          sleep(1)
        })
        it('resolves document', () => {
          return expect(didResolver.resolve(did)).resolves.toEqual({
            '@context': 'https://w3id.org/did/v1',
            id: did,
            publicKey: [
              {
                id: `${did}#controller`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                ethereumAddress: controller
              },
              {
                id: `${did}#delegate-1`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                ethereumAddress: delegate2
              },
              {
                id: `${did}#delegate-3`,
                type: 'Ed25519VerificationKey2018',
                controller: did,
                publicKeyBase64: Buffer.from(
                  '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
                  'hex'
                ).toString('base64')
              },
              {
                id: `${did}#delegate-4`,
                type: 'RSAVerificationKey2018',
                controller: did,
                publicKeyPem: '-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n'
              }
            ],
            authentication: [
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#controller`
              },
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#delegate-1`
              }
            ],
            service: [
              {
                type: 'HubService',
                serviceEndpoint: 'https://hubs.uport.me'
              }
            ]
          })
        })
      })

      describe('Ed25519VerificationKey2018', () => {
        beforeAll(async () => {
          await registry.revokeAttribute(
            identity,
            stringToBytes32('did/pub/Ed25519/veriKey/base64'),
            '0x02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
            { from: controller }
          )
          sleep(1)
        })
        it('resolves document', () => {
          return expect(didResolver.resolve(did)).resolves.toEqual({
            '@context': 'https://w3id.org/did/v1',
            id: did,
            publicKey: [
              {
                id: `${did}#controller`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                ethereumAddress: controller
              },
              {
                id: `${did}#delegate-1`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                ethereumAddress: delegate2
              },
              {
                id: `${did}#delegate-4`,
                type: 'RSAVerificationKey2018',
                controller: did,
                publicKeyPem: '-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n'
              }
            ],
            authentication: [
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#controller`
              },
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#delegate-1`
              }
            ],
            service: [
              {
                type: 'HubService',
                serviceEndpoint: 'https://hubs.uport.me'
              }
            ]
          })
        })
      })

      describe('RSAVerificationKey2018', () => {
        beforeAll(async () => {
          await registry.revokeAttribute(
            identity,
            stringToBytes32('did/pub/RSA/veriKey/pem'),
            '-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n',
            { from: controller }
          )
          sleep(1)
        })

        it('resolves document', () => {
          return expect(didResolver.resolve(did)).resolves.toEqual({
            '@context': 'https://w3id.org/did/v1',
            id: did,
            publicKey: [
              {
                id: `${did}#controller`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                ethereumAddress: controller
              },
              {
                id: `${did}#delegate-1`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                ethereumAddress: delegate2
              }
            ],
            authentication: [
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#controller`
              },
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#delegate-1`
              }
            ],
            service: [
              {
                type: 'HubService',
                serviceEndpoint: 'https://hubs.uport.me'
              }
            ]
          })
        })
      })
    })

    describe('revoke service endpoints', () => {
      describe('HubService', () => {
        beforeAll(async () => {
          await registry.revokeAttribute(identity, stringToBytes32('did/svc/HubService'), 'https://hubs.uport.me', {
            from: controller
          })
          sleep(1)
        })

        it('resolves document', () => {
          return expect(didResolver.resolve(did)).resolves.toEqual({
            '@context': 'https://w3id.org/did/v1',
            id: did,
            publicKey: [
              {
                id: `${did}#controller`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                ethereumAddress: controller
              },
              {
                id: `${did}#delegate-1`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                ethereumAddress: delegate2
              }
            ],
            authentication: [
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#controller`
              },
              {
                type: 'Secp256k1SignatureAuthentication2018',
                publicKey: `${did}#delegate-1`
              }
            ]
          })
        })
      })
    })
  })

  describe('multiple events in one block', () => {
    beforeAll(async () => {
      await stopMining()
      await Promise.all([
        registry.setAttribute(identity, stringToBytes32('did/svc/TestService'), 'https://test.uport.me', 10, {
          from: controller
        }),
        registry.setAttribute(identity, stringToBytes32('did/svc/TestService'), 'https://test.uport.me', 10, {
          from: controller
        }),
        sleep(1).then(() => startMining())
      ])
    })

    it('resolves document', async () => {
      expect(await didResolver.resolve(did)).toEqual({
        '@context': 'https://w3id.org/did/v1',
        id: did,
        publicKey: [
          {
            id: `${did}#controller`,
            type: 'Secp256k1VerificationKey2018',
            controller: did,
            ethereumAddress: controller
          },
          {
            id: `${did}#delegate-1`,
            type: 'Secp256k1VerificationKey2018',
            controller: did,
            ethereumAddress: delegate2
          }
        ],
        authentication: [
          {
            type: 'Secp256k1SignatureAuthentication2018',
            publicKey: `${did}#controller`
          },
          {
            type: 'Secp256k1SignatureAuthentication2018',
            publicKey: `${did}#delegate-1`
          }
        ],
        service: [
          {
            type: 'TestService',
            serviceEndpoint: 'https://test.uport.me'
          }
        ]
      })
    })
  })

  describe('attribute revocation event in same block(-batch) as attribute creation', () => {
    beforeAll(async () => {
      await stopMining()
      await Promise.all([
        registry.setAttribute(identity, stringToBytes32('did/svc/TestService2'), 'https://test2.uport.me', 10, {
          from: controller
        }),
        sleep(1).then(() =>
          registry.revokeAttribute(identity, stringToBytes32('did/svc/TestService2'), 'https://test2.uport.me', {
            from: controller
          })
        ),
        sleep(2).then(() => startMining())
      ])
    })

    it('resolves document', async () => {
      expect(await didResolver.resolve(did)).toEqual({
        '@context': 'https://w3id.org/did/v1',
        id: did,
        publicKey: [
          {
            id: `${did}#controller`,
            type: 'Secp256k1VerificationKey2018',
            controller: did,
            ethereumAddress: controller
          },
          {
            id: `${did}#delegate-1`,
            type: 'Secp256k1VerificationKey2018',
            controller: did,
            ethereumAddress: delegate2
          }
        ],
        authentication: [
          {
            type: 'Secp256k1SignatureAuthentication2018',
            publicKey: `${did}#controller`
          },
          {
            type: 'Secp256k1SignatureAuthentication2018',
            publicKey: `${did}#delegate-1`
          }
        ],
        service: [
          {
            type: 'TestService',
            serviceEndpoint: 'https://test.uport.me'
          }
        ]
      })
    })
  })

  describe('error handling', () => {
    it('rejects promise', () => {
      return expect(didResolver.resolve('did:ethr:2nQtiQG6Cgm1GYTBaaKAgr76uY7iSexUkqX')).rejects.toEqual(
        new Error('Not a valid ethr DID: did:ethr:2nQtiQG6Cgm1GYTBaaKAgr76uY7iSexUkqX')
      )
    })
  })
})

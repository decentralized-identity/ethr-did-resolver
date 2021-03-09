import { Web3Provider } from '@ethersproject/providers'
import { Contract, ContractFactory } from '@ethersproject/contracts'
import { Resolver } from 'did-resolver'
import { getResolver } from '../resolver'
import { EthrDidController } from '../controller'
import DidRegistryContract from 'ethr-did-registry'
import ganache from 'ganache-cli'
import { stringToBytes32 } from '../utils'

async function sleep(seconds: number) {
  return new Promise((resolve, reject) => setTimeout(resolve, seconds * 1000))
}

describe('ethrResolver', () => {
  async function stopMining(provider: Web3Provider) {
    return provider.send('miner_stop', [])
  }
  async function startMining(provider: Web3Provider) {
    return provider.send('miner_start', [1])
  }

  // let registry, accounts, did, identity, controller, delegate1, delegate2, ethr, didResolver
  let registryContract: Contract,
    accounts,
    did: string,
    identity: string,
    controller: string,
    delegate1: string,
    delegate2: string,
    keyAgreementController: string,
    didResolver: Resolver,
    web3Provider: Web3Provider

  web3Provider = new Web3Provider(
    ganache.provider({
      accounts: [
        {
          secretKey: '0x278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f',
          //  address: '0xf3beac30c498d9e26865f34fcaa57dbb935b0d74',
          //  publicKey: '03fdd57adec3d438ea237fe46b33ee1e016eda6b585c3e27ea66686c2ea5358479'
          balance: '0x1000000000000000000000',
        },
        {
          secretKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
          //  address: '0x7e5f4552091a69125d5dfcb7b8c2659029395bdf',
          //  publicKey: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
          balance: '0x1000000000000000000000',
        },
        {
          secretKey: '0x0000000000000000000000000000000000000000000000000000000000000002',
          //  address: '0x2b5ad5c4795c026514f8317c7a215e218dccd6cf',
          //  publicKey: '02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5'
          balance: '0x1000000000000000000000',
        },
        {
          secretKey: '0x0000000000000000000000000000000000000000000000000000000000000003',
          //  address: '0x6813eb9362372eef6200f3b1dbc3f819671cba69',
          //  publicKey: '02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9'
          balance: '0x1000000000000000000000',
        },
        {
          secretKey: '0x0000000000000000000000000000000000000000000000000000000000000004',
          //  address: '0x1eff47bc3a10a45d4b230b5d10e37751fe6aa718',
          //  publicKey: '02e493dbf1c10d80f3581e4904930b1404cc6c13900ee0758474fa94abe8c4cd13'
          balance: '0x1000000000000000000000',
        },
        {
          secretKey: '0x0000000000000000000000000000000000000000000000000000000000000005',
          //  address: '0xe1ab8145f7e55dc933d51a18c793f901a3a0b276'
          //  publicKey: '022f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4'
          balance: '0x1000000000000000000000',
        },
      ],
    })
  )

  beforeAll(async () => {
    const factory = ContractFactory.fromSolidity(DidRegistryContract).connect(web3Provider.getSigner(0))

    registryContract = await factory.deploy()
    registryContract = await registryContract.deployed()

    await registryContract.deployTransaction.wait()

    const registry = registryContract.address

    accounts = await web3Provider.listAccounts()

    identity = accounts[1]
    controller = accounts[2]
    delegate1 = accounts[3]
    delegate2 = accounts[4]
    keyAgreementController = accounts[5]
    did = `did:ethr:dev:${identity}`

    didResolver = new Resolver(getResolver({ name: 'dev', provider: web3Provider, registry }))
  })

  describe('unregistered', () => {
    it('resolves document', async () => {
      expect.assertions(1)
      await expect(didResolver.resolve(did)).resolves.toEqual({
        didDocumentMetadata: {},
        didResolutionMetadata: { contentType: 'application/did+ld+json' },
        didDocument: {
          '@context': 'https://w3id.org/did/v1',
          id: did,
          publicKey: [
            {
              id: `${did}#controller`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              ethereumAddress: identity,
            },
          ],
          authentication: [`${did}#controller`],
        },
      })
    })

    it('resolves document with publicKey identifier', async () => {
      expect.assertions(1)
      const pubKey = '0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
      const pubdid = `did:ethr:dev:${pubKey}`
      await expect(didResolver.resolve(pubdid)).resolves.toEqual({
        didDocumentMetadata: {},
        didResolutionMetadata: { contentType: 'application/did+ld+json' },
        didDocument: {
          '@context': 'https://w3id.org/did/v1',
          id: pubdid,
          publicKey: [
            {
              id: `${pubdid}#controller`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: pubdid,
              ethereumAddress: identity,
            },
            {
              id: `${pubdid}#controllerKey`,
              type: 'EcdsaSecp256k1VerificationKey2019',
              controller: pubdid,
              publicKeyHex: pubKey,
            },
          ],
          authentication: [`${pubdid}#controller`, `${pubdid}#controllerKey`],
        },
      })
    })
  })

  describe('controller changed', () => {
    beforeAll(async () => {
      await new EthrDidController(identity, registryContract).changeOwner(controller, { from: identity })
    })

    it('resolves document', async () => {
      expect.assertions(1)
      await expect(didResolver.resolve(did)).resolves.toEqual({
        didDocumentMetadata: {},
        didResolutionMetadata: { contentType: 'application/did+ld+json' },
        didDocument: {
          '@context': 'https://w3id.org/did/v1',
          id: did,
          publicKey: [
            {
              id: `${did}#controller`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              ethereumAddress: controller,
            },
          ],
          authentication: [`${did}#controller`],
        },
      })
    })

    it('changing controller invalidates the publicKey as identifier', async () => {
      expect.assertions(3)
      const pubKey = '0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
      const pubdid = `did:ethr:dev:${pubKey}`
      const { didDocument } = await didResolver.resolve(pubdid)
      expect(didDocument).toEqual({
        '@context': 'https://w3id.org/did/v1',
        id: pubdid,
        publicKey: [
          {
            id: `${pubdid}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: pubdid,
            ethereumAddress: controller,
          },
        ],
        authentication: [`${pubdid}#controller`],
      })
      expect(didDocument?.publicKey?.length).toBe(1)
      expect(didDocument?.authentication?.length).toBe(1)
    })
  })

  describe('delegates', () => {
    describe('add signing delegate', () => {
      it('resolves document', async () => {
        expect.assertions(1)
        await new EthrDidController(identity, registryContract).addDelegate('veriKey', delegate1, 100, {
          from: controller,
        })
        await expect(didResolver.resolve(did)).resolves.toEqual({
          didDocumentMetadata: {},
          didResolutionMetadata: { contentType: 'application/did+ld+json' },
          didDocument: {
            '@context': 'https://w3id.org/did/v1',
            id: did,
            publicKey: [
              {
                id: `${did}#controller`,
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: did,
                ethereumAddress: controller,
              },
              {
                id: `${did}#delegate-1`,
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: did,
                ethereumAddress: delegate1,
              },
            ],
            authentication: [`${did}#controller`],
          },
        })
      })
    })

    describe('add auth delegate', () => {
      it('resolves document', async () => {
        expect.assertions(1)
        await new EthrDidController(identity, registryContract).addDelegate('sigAuth', delegate2, 1, {
          from: controller,
        })
        await expect(didResolver.resolve(did)).resolves.toEqual({
          didDocumentMetadata: {},
          didResolutionMetadata: { contentType: 'application/did+ld+json' },
          didDocument: {
            '@context': 'https://w3id.org/did/v1',
            id: did,
            publicKey: [
              {
                id: `${did}#controller`,
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: did,
                ethereumAddress: controller,
              },
              {
                id: `${did}#delegate-1`,
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: did,
                ethereumAddress: delegate1,
              },
              {
                id: `${did}#delegate-2`,
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: did,
                ethereumAddress: delegate2,
              },
            ],
            authentication: [`${did}#controller`, `${did}#delegate-2`],
          },
        })
      })
    })

    describe('expire automatically', () => {
      it('resolves document', async () => {
        expect.assertions(1)
        //key validity was set to less than 2 seconds
        await sleep(3)
        await expect(didResolver.resolve(did)).resolves.toEqual({
          didDocumentMetadata: {},
          didResolutionMetadata: { contentType: 'application/did+ld+json' },
          didDocument: {
            '@context': 'https://w3id.org/did/v1',
            id: did,
            publicKey: [
              {
                id: `${did}#controller`,
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: did,
                ethereumAddress: controller,
              },
              {
                id: `${did}#delegate-1`,
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: did,
                ethereumAddress: delegate1,
              },
            ],
            authentication: [`${did}#controller`],
          },
        })
      })
    })

    describe('revokes delegate', () => {
      it('resolves document', async () => {
        expect.assertions(1)
        await new EthrDidController(identity, registryContract).revokeDelegate('veriKey', delegate1, {
          from: controller,
        })
        await sleep(1)
        await expect(didResolver.resolve(did)).resolves.toEqual({
          didDocumentMetadata: {},
          didResolutionMetadata: { contentType: 'application/did+ld+json' },
          didDocument: {
            '@context': 'https://w3id.org/did/v1',
            id: did,
            publicKey: [
              {
                id: `${did}#controller`,
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: did,
                ethereumAddress: controller,
              },
            ],
            authentication: [`${did}#controller`],
          },
        })
      })
    })

    describe('re-add auth delegate', () => {
      it('resolves document', async () => {
        expect.assertions(1)
        await new EthrDidController(identity, registryContract).addDelegate('sigAuth', delegate2, 86400, {
          from: controller,
        })
        await expect(didResolver.resolve(did)).resolves.toEqual({
          didDocumentMetadata: {},
          didResolutionMetadata: { contentType: 'application/did+ld+json' },
          didDocument: {
            '@context': 'https://w3id.org/did/v1',
            id: did,
            publicKey: [
              {
                id: `${did}#controller`,
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: did,
                ethereumAddress: controller,
              },
              {
                id: `${did}#delegate-1`,
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: did,
                ethereumAddress: delegate2,
              },
            ],
            authentication: [`${did}#controller`, `${did}#delegate-1`],
          },
        })
      })
    })
  })

  describe('attributes', () => {
    describe('add publicKey', () => {
      describe('Secp256k1VerificationKey2018', () => {
        it('resolves document', async () => {
          expect.assertions(1)
          await new EthrDidController(identity, registryContract).setAttribute(
            'did/pub/Secp256k1/veriKey',
            '0x02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
            10,
            { from: controller }
          )
          const { didDocument } = await didResolver.resolve(did)
          expect(didDocument).toEqual({
            '@context': 'https://w3id.org/did/v1',
            id: did,
            publicKey: [
              {
                id: `${did}#controller`,
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: did,
                ethereumAddress: controller,
              },
              {
                id: `${did}#delegate-1`,
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: did,
                ethereumAddress: delegate2,
              },
              {
                id: `${did}#delegate-2`,
                type: 'EcdsaSecp256k1VerificationKey2019',
                controller: did,
                publicKeyHex: '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
              },
            ],
            authentication: [`${did}#controller`, `${did}#delegate-1`],
          })
        })
      })

      describe('Ed25519VerificationKey2018', () => {
        it('resolves document', async () => {
          expect.assertions(1)
          await new EthrDidController(identity, registryContract).setAttribute(
            'did/pub/Ed25519/veriKey/base64',
            '0x02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
            10,
            { from: controller }
          )
          const { didDocument } = await didResolver.resolve(did)
          expect(didDocument).toEqual({
            '@context': 'https://w3id.org/did/v1',
            id: did,
            publicKey: [
              {
                id: `${did}#controller`,
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: did,
                ethereumAddress: controller,
              },
              {
                id: `${did}#delegate-1`,
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: did,
                ethereumAddress: delegate2,
              },
              {
                id: `${did}#delegate-2`,
                type: 'EcdsaSecp256k1VerificationKey2019',
                controller: did,
                publicKeyHex: '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
              },
              {
                id: `${did}#delegate-3`,
                type: 'Ed25519VerificationKey2018',
                controller: did,
                publicKeyBase64: Buffer.from(
                  '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
                  'hex'
                ).toString('base64'),
              },
            ],
            authentication: [`${did}#controller`, `${did}#delegate-1`],
          })
        })
      })

      describe('RSAVerificationKey2018', () => {
        it('resolves document', async () => {
          expect.assertions(1)
          await new EthrDidController(identity, registryContract).setAttribute(
            'did/pub/RSA/veriKey/pem',
            '-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n',
            10,
            { from: controller }
          )
          const { didDocument } = await didResolver.resolve(did)
          expect(didDocument).toEqual({
            '@context': 'https://w3id.org/did/v1',
            id: did,
            publicKey: [
              {
                id: `${did}#controller`,
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: did,
                ethereumAddress: controller,
              },
              {
                id: `${did}#delegate-1`,
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: did,
                ethereumAddress: delegate2,
              },
              {
                id: `${did}#delegate-2`,
                type: 'EcdsaSecp256k1VerificationKey2019',
                controller: did,
                publicKeyHex: '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
              },
              {
                id: `${did}#delegate-3`,
                type: 'Ed25519VerificationKey2018',
                controller: did,
                publicKeyBase64: Buffer.from(
                  '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
                  'hex'
                ).toString('base64'),
              },
              {
                id: `${did}#delegate-4`,
                type: 'RSAVerificationKey2018',
                controller: did,
                publicKeyPem: '-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n',
              },
            ],
            authentication: [`${did}#controller`, `${did}#delegate-1`],
          })
        })
      })

      describe('X25519KeyAgreementKey2019', () => {
        it('resolves document', async () => {
          expect.assertions(1)
          const keyAgrDid = `did:ethr:dev:${keyAgreementController}`
          await new EthrDidController(
            keyAgreementController,
            registryContract
          ).setAttribute(
            'did/pub/X25519/enc/base64',
            `0x${Buffer.from('MCowBQYDK2VuAyEAEYVXd3/7B4d0NxpSsA/tdVYdz5deYcR1U+ZkphdmEFI=', 'base64').toString(
              'hex'
            )}`,
            86400,
            { from: keyAgreementController }
          )
          const { didDocument } = await didResolver.resolve(keyAgrDid)
          expect(didDocument).toEqual({
            '@context': 'https://w3id.org/did/v1',
            id: keyAgrDid,
            publicKey: [
              {
                id: `${keyAgrDid}#controller`,
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: keyAgrDid,
                ethereumAddress: keyAgreementController,
              },
              {
                id: `${keyAgrDid}#delegate-1`,
                type: 'X25519KeyAgreementKey2019',
                controller: keyAgrDid,
                publicKeyBase64: 'MCowBQYDK2VuAyEAEYVXd3/7B4d0NxpSsA/tdVYdz5deYcR1U+ZkphdmEFI=',
              },
            ],
            authentication: [`${keyAgrDid}#controller`],
          })
        })
      })
    })

    describe('add service endpoints', () => {
      describe('HubService', () => {
        it('resolves document', async () => {
          expect.assertions(1)
          await new EthrDidController(identity, registryContract).setAttribute(
            stringToBytes32('did/svc/HubService'),
            'https://hubs.uport.me',
            10,
            { from: controller }
          )
          const { didDocument } = await didResolver.resolve(did)
          expect(didDocument).toEqual({
            '@context': 'https://w3id.org/did/v1',
            id: did,
            publicKey: [
              {
                id: `${did}#controller`,
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: did,
                ethereumAddress: controller,
              },
              {
                id: `${did}#delegate-1`,
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: did,
                ethereumAddress: delegate2,
              },
              {
                id: `${did}#delegate-2`,
                type: 'EcdsaSecp256k1VerificationKey2019',
                controller: did,
                publicKeyHex: '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
              },
              {
                id: `${did}#delegate-3`,
                type: 'Ed25519VerificationKey2018',
                controller: did,
                publicKeyBase64: Buffer.from(
                  '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
                  'hex'
                ).toString('base64'),
              },
              {
                id: `${did}#delegate-4`,
                type: 'RSAVerificationKey2018',
                controller: did,
                publicKeyPem: '-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n',
              },
            ],
            authentication: [`${did}#controller`, `${did}#delegate-1`],
            service: [
              {
                id: `${did}#service-1`,
                type: 'HubService',
                serviceEndpoint: 'https://hubs.uport.me',
              },
            ],
          })
        })
      })
    })
  })

  describe('revoke publicKey', () => {
    describe('Secp256k1VerificationKey2018', () => {
      it('resolves document', async () => {
        expect.assertions(1)
        await new EthrDidController(identity, registryContract).revokeAttribute(
          'did/pub/Secp256k1/veriKey',
          '0x02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
          { from: controller }
        )
        const { didDocument } = await didResolver.resolve(did)
        expect(didDocument).toEqual({
          '@context': 'https://w3id.org/did/v1',
          id: did,
          publicKey: [
            {
              id: `${did}#controller`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              ethereumAddress: controller,
            },
            {
              id: `${did}#delegate-1`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              ethereumAddress: delegate2,
            },
            {
              id: `${did}#delegate-3`,
              type: 'Ed25519VerificationKey2018',
              controller: did,
              publicKeyBase64: Buffer.from(
                '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
                'hex'
              ).toString('base64'),
            },
            {
              id: `${did}#delegate-4`,
              type: 'RSAVerificationKey2018',
              controller: did,
              publicKeyPem: '-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n',
            },
          ],
          authentication: [`${did}#controller`, `${did}#delegate-1`],
          service: [
            {
              id: `${did}#service-1`,
              type: 'HubService',
              serviceEndpoint: 'https://hubs.uport.me',
            },
          ],
        })
      })
    })

    describe('Ed25519VerificationKey2018', () => {
      it('resolves document', async () => {
        expect.assertions(1)
        await new EthrDidController(identity, registryContract).revokeAttribute(
          'did/pub/Ed25519/veriKey/base64',
          '0x02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
          { from: controller }
        )
        const { didDocument } = await didResolver.resolve(did)
        expect(didDocument).toEqual({
          '@context': 'https://w3id.org/did/v1',
          id: did,
          publicKey: [
            {
              id: `${did}#controller`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              ethereumAddress: controller,
            },
            {
              id: `${did}#delegate-1`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              ethereumAddress: delegate2,
            },
            {
              id: `${did}#delegate-4`,
              type: 'RSAVerificationKey2018',
              controller: did,
              publicKeyPem: '-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n',
            },
          ],
          authentication: [`${did}#controller`, `${did}#delegate-1`],
          service: [
            {
              id: `${did}#service-1`,
              type: 'HubService',
              serviceEndpoint: 'https://hubs.uport.me',
            },
          ],
        })
      })
    })

    describe('RSAVerificationKey2018', () => {
      it('resolves document', async () => {
        expect.assertions(1)
        await new EthrDidController(identity, registryContract).revokeAttribute(
          stringToBytes32('did/pub/RSA/veriKey/pem'),
          '-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n',
          { from: controller }
        )
        const { didDocument } = await didResolver.resolve(did)
        expect(didDocument).toEqual({
          '@context': 'https://w3id.org/did/v1',
          id: did,
          publicKey: [
            {
              id: `${did}#controller`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              ethereumAddress: controller,
            },
            {
              id: `${did}#delegate-1`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              ethereumAddress: delegate2,
            },
          ],
          authentication: [`${did}#controller`, `${did}#delegate-1`],
          service: [
            {
              id: `${did}#service-1`,
              type: 'HubService',
              serviceEndpoint: 'https://hubs.uport.me',
            },
          ],
        })
      })
    })

    describe('revoke service endpoints', () => {
      describe('HubService', () => {
        it('resolves document', async () => {
          expect.assertions(1)
          await new EthrDidController(identity, registryContract).revokeAttribute(
            stringToBytes32('did/svc/HubService'),
            'https://hubs.uport.me',
            { from: controller }
          )
          const { didDocument } = await didResolver.resolve(did)
          expect(didDocument).toEqual({
            '@context': 'https://w3id.org/did/v1',
            id: did,
            publicKey: [
              {
                id: `${did}#controller`,
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: did,
                ethereumAddress: controller,
              },
              {
                id: `${did}#delegate-1`,
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: did,
                ethereumAddress: delegate2,
              },
            ],
            authentication: [`${did}#controller`, `${did}#delegate-1`],
          })
        })
      })
    })
  })

  describe('multiple events in one block', () => {
    beforeAll(async () => {
      const ethrDid = new EthrDidController(identity, registryContract)
      await stopMining(web3Provider)
      await Promise.all([
        ethrDid.setAttribute(stringToBytes32('did/svc/TestService'), 'https://test.uport.me', 10, { from: controller }),
        ethrDid.setAttribute(stringToBytes32('did/svc/TestService'), 'https://test.uport.me', 10, { from: controller }),
        sleep(1).then(() => startMining(web3Provider)),
      ])
    })

    it('resolves document', async () => {
      expect.assertions(1)
      expect(await didResolver.resolve(did)).toEqual({
        didDocumentMetadata: {},
        didResolutionMetadata: {
          contentType: 'application/did+ld+json',
        },
        didDocument: {
          '@context': 'https://w3id.org/did/v1',
          id: did,
          publicKey: [
            {
              id: `${did}#controller`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              ethereumAddress: controller,
            },
            {
              id: `${did}#delegate-1`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              ethereumAddress: delegate2,
            },
          ],
          authentication: [`${did}#controller`, `${did}#delegate-1`],
          service: [
            {
              id: `${did}#service-3`,
              type: 'TestService',
              serviceEndpoint: 'https://test.uport.me',
            },
          ],
        },
      })
    })
  })

  describe('attribute revocation event in same block(-batch) as attribute creation', () => {
    beforeAll(async () => {
      const ethrDid = new EthrDidController(identity, registryContract)
      await stopMining(web3Provider)
      await Promise.all([
        ethrDid.setAttribute(stringToBytes32('did/svc/TestService2'), 'https://test2.uport.me', 10, {
          from: controller,
        }),
        sleep(1).then(() =>
          ethrDid.revokeAttribute(stringToBytes32('did/svc/TestService2'), 'https://test2.uport.me', {
            from: controller,
          })
        ),
        sleep(1).then(() => startMining(web3Provider)),
      ])
    })

    it('resolves document', async () => {
      expect.assertions(1)
      expect(await didResolver.resolve(did)).toEqual({
        didDocumentMetadata: {},
        didResolutionMetadata: {
          contentType: 'application/did+ld+json',
        },
        didDocument: {
          '@context': 'https://w3id.org/did/v1',
          id: did,
          publicKey: [
            {
              id: `${did}#controller`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              ethereumAddress: controller,
            },
            {
              id: `${did}#delegate-1`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              ethereumAddress: delegate2,
            },
          ],
          authentication: [`${did}#controller`, `${did}#delegate-1`],
          service: [
            {
              id: `${did}#service-2`,
              type: 'TestService',
              serviceEndpoint: 'https://test.uport.me',
            },
          ],
        },
      })
    })
  })

  describe('error handling', () => {
    it('rejects promise', async () => {
      expect.assertions(1)
      await expect(didResolver.resolve('did:ethr:2nQtiQG6Cgm1GYTBaaKAgr76uY7iSexUkqX')).rejects.toEqual(
        new Error('Not a valid ethr DID: did:ethr:2nQtiQG6Cgm1GYTBaaKAgr76uY7iSexUkqX')
      )
    })
  })
})

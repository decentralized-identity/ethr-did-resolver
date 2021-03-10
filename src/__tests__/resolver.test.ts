import { Contract, ContractFactory } from '@ethersproject/contracts'
import { Resolver } from 'did-resolver'
import { getResolver } from '../resolver'
import { EthrDidController } from '../controller'
import DidRegistryContract from 'ethr-did-registry'

import { interpretIdentifier, stringToBytes32 } from '../utils'
import { createProvider, sleep, startMining, stopMining } from './testUtils'

describe('ethrResolver', () => {
  // let registry, accounts, did, identity, controller, delegate1, delegate2, ethr, didResolver
  let registryContract: Contract,
    accounts,
    did: string,
    identity: string,
    controller: string,
    delegate1: string,
    delegate2: string,
    keyAgreementController: string,
    didResolver: Resolver

  const web3Provider = createProvider()

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
    it('resolves document', async () => {
      expect.assertions(1)
      await new EthrDidController(identity, registryContract).changeOwner(controller, { from: identity })
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
                id: `${did}#delegate-4`,
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: did,
                ethereumAddress: delegate2,
              },
            ],
            authentication: [`${did}#controller`, `${did}#delegate-4`],
          },
        })
      })
    })
  })

  describe('attributes', () => {
    describe('add publicKey', () => {
      it('resolves with EcdsaSecp256k1VerificationKey2019', async () => {
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
              id: `${did}#delegate-4`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              ethereumAddress: delegate2,
            },
            {
              id: `${did}#delegate-5`,
              type: 'EcdsaSecp256k1VerificationKey2019',
              controller: did,
              publicKeyHex: '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
            },
          ],
          authentication: [`${did}#controller`, `${did}#delegate-4`],
        })
      })

      it('resolves with Ed25519VerificationKey2018', async () => {
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
              id: `${did}#delegate-4`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              ethereumAddress: delegate2,
            },
            {
              id: `${did}#delegate-5`,
              type: 'EcdsaSecp256k1VerificationKey2019',
              controller: did,
              publicKeyHex: '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
            },
            {
              id: `${did}#delegate-6`,
              type: 'Ed25519VerificationKey2018',
              controller: did,
              publicKeyBase64: Buffer.from(
                '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
                'hex'
              ).toString('base64'),
            },
          ],
          authentication: [`${did}#controller`, `${did}#delegate-4`],
        })
      })

      it('resolves with RSAVerificationKey2018', async () => {
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
              id: `${did}#delegate-4`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              ethereumAddress: delegate2,
            },
            {
              id: `${did}#delegate-5`,
              type: 'EcdsaSecp256k1VerificationKey2019',
              controller: did,
              publicKeyHex: '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
            },
            {
              id: `${did}#delegate-6`,
              type: 'Ed25519VerificationKey2018',
              controller: did,
              publicKeyBase64: Buffer.from(
                '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
                'hex'
              ).toString('base64'),
            },
            {
              id: `${did}#delegate-7`,
              type: 'RSAVerificationKey2018',
              controller: did,
              publicKeyPem: '-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n',
            },
          ],
          authentication: [`${did}#controller`, `${did}#delegate-4`],
        })
      })

      it('resolves with X25519KeyAgreementKey2019', async () => {
        expect.assertions(1)
        const keyAgrDid = `did:ethr:dev:${keyAgreementController}`
        await new EthrDidController(keyAgreementController, registryContract).setAttribute(
          'did/pub/X25519/enc/base64',
          `0x${Buffer.from('MCowBQYDK2VuAyEAEYVXd3/7B4d0NxpSsA/tdVYdz5deYcR1U+ZkphdmEFI=', 'base64').toString('hex')}`,
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

    describe('add service endpoints', () => {
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
              id: `${did}#delegate-4`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              ethereumAddress: delegate2,
            },
            {
              id: `${did}#delegate-5`,
              type: 'EcdsaSecp256k1VerificationKey2019',
              controller: did,
              publicKeyHex: '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
            },
            {
              id: `${did}#delegate-6`,
              type: 'Ed25519VerificationKey2018',
              controller: did,
              publicKeyBase64: Buffer.from(
                '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
                'hex'
              ).toString('base64'),
            },
            {
              id: `${did}#delegate-7`,
              type: 'RSAVerificationKey2018',
              controller: did,
              publicKeyPem: '-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n',
            },
          ],
          authentication: [`${did}#controller`, `${did}#delegate-4`],
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

  describe('revoke publicKey', () => {
    it('resolves without EcdsaSecp256k1VerificationKey2019', async () => {
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
            id: `${did}#delegate-4`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: did,
            ethereumAddress: delegate2,
          },
          {
            id: `${did}#delegate-6`,
            type: 'Ed25519VerificationKey2018',
            controller: did,
            publicKeyBase64: Buffer.from(
              '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
              'hex'
            ).toString('base64'),
          },
          {
            id: `${did}#delegate-7`,
            type: 'RSAVerificationKey2018',
            controller: did,
            publicKeyPem: '-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n',
          },
        ],
        authentication: [`${did}#controller`, `${did}#delegate-4`],
        service: [
          {
            id: `${did}#service-1`,
            type: 'HubService',
            serviceEndpoint: 'https://hubs.uport.me',
          },
        ],
      })
    })

    it('resolves without Ed25519VerificationKey2018', async () => {
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
            id: `${did}#delegate-4`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: did,
            ethereumAddress: delegate2,
          },
          {
            id: `${did}#delegate-7`,
            type: 'RSAVerificationKey2018',
            controller: did,
            publicKeyPem: '-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n',
          },
        ],
        authentication: [`${did}#controller`, `${did}#delegate-4`],
        service: [
          {
            id: `${did}#service-1`,
            type: 'HubService',
            serviceEndpoint: 'https://hubs.uport.me',
          },
        ],
      })
    })

    it('resolves without RSAVerificationKey2018', async () => {
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
            id: `${did}#delegate-4`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: did,
            ethereumAddress: delegate2,
          },
        ],
        authentication: [`${did}#controller`, `${did}#delegate-4`],
        service: [
          {
            id: `${did}#service-1`,
            type: 'HubService',
            serviceEndpoint: 'https://hubs.uport.me',
          },
        ],
      })
    })

    describe('revoke service endpoints', () => {
      it('resolves without HubService', async () => {
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
              id: `${did}#delegate-4`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              ethereumAddress: delegate2,
            },
          ],
          authentication: [`${did}#controller`, `${did}#delegate-4`],
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
              id: `${did}#delegate-4`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              ethereumAddress: delegate2,
            },
          ],
          authentication: [`${did}#controller`, `${did}#delegate-4`],
          service: [
            {
              id: `${did}#service-4`,
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
              id: `${did}#delegate-4`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              ethereumAddress: delegate2,
            },
          ],
          authentication: [`${did}#controller`, `${did}#delegate-4`],
          service: [
            {
              id: `${did}#service-4`,
              type: 'TestService',
              serviceEndpoint: 'https://test.uport.me',
            },
          ],
        },
      })
    })
  })

  describe('regression', () => {
    it('resolves same document with case sensitive eth address (https://github.com/decentralized-identity/ethr-did-resolver/issues/105)', async () => {
      expect.assertions(3)
      const lowId = keyAgreementController.toLowerCase()
      const checkSumId = interpretIdentifier(lowId).address
      const keyAgrDid = `did:ethr:dev:${lowId}`
      const keyAgrDidChecksum = `did:ethr:dev:${checkSumId}`
      await new EthrDidController(lowId, registryContract).setAttribute(
        'did/pub/Secp256k1/veriKey/hex',
        '0x02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
        10,
        { from: lowId }
      )
      const didDocumentLow = (await didResolver.resolve(keyAgrDid)).didDocument
      const didDocumentChecksum = (await didResolver.resolve(keyAgrDidChecksum)).didDocument
      expect(keyAgrDid).not.toEqual(keyAgrDidChecksum)
      expect(didDocumentLow).toBeDefined()
      //we don't care about the actual keys, only about their sameness
      expect(JSON.stringify(didDocumentLow).toLowerCase()).toEqual(JSON.stringify(didDocumentChecksum).toLowerCase())
    })

    it('adds sigAuth to authentication section (https://github.com/decentralized-identity/ethr-did-resolver/issues/95)', async () => {
      expect.assertions(1)
      const delegate2DID = `did:ethr:dev:${delegate2}`
      const authPubKey = `31303866356238393330623164633235386162353765386630646362363932353963363162316166`
      await new EthrDidController(delegate2, registryContract).setAttribute(
        'did/pub/Ed25519/sigAuth/hex',
        `0x${authPubKey}`,
        86400,
        { from: delegate2 }
      )
      const { didDocument } = await didResolver.resolve(delegate2DID)
      expect(didDocument).toEqual({
        '@context': 'https://w3id.org/did/v1',
        id: delegate2DID,
        publicKey: [
          {
            id: `${delegate2DID}#controller`,
            controller: delegate2DID,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            ethereumAddress: delegate2,
          },
          {
            id: `${delegate2DID}#delegate-1`,
            controller: delegate2DID,
            type: `Ed25519VerificationKey2018`,
            publicKeyHex: authPubKey,
          },
        ],
        authentication: [`${delegate2DID}#controller`, `${delegate2DID}#delegate-1`],
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

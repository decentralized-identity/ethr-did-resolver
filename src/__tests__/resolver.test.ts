import { Contract, ContractFactory } from '@ethersproject/contracts'
import { Resolvable, Resolver } from 'did-resolver'
import { getResolver } from '../resolver'
import { EthrDidController } from '../controller'
import DidRegistryContract from 'ethr-did-registry'
import * as u8a from 'uint8arrays'
import { interpretIdentifier, stringToBytes32 } from '../helpers'
import { createProvider, sleep, startMining, stopMining } from './testUtils'
import { nullAddress } from '../helpers'

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
    didResolver: Resolvable

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
              blockchainAccountId: `${identity}@eip155:1337`,
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
          '@context': [
            'https://www.w3.org/ns/did/v1',
            'https://identity.foundation/EcdsaSecp256k1RecoverySignature2020/lds-ecdsa-secp256k1-recovery2020-0.0.jsonld',
          ],
          id: pubdid,
          verificationMethod: [
            {
              id: `${pubdid}#controller`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: pubdid,
              blockchainAccountId: `${identity}@eip155:1337`,
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
      const result = await didResolver.resolve(did)
      delete result.didDocumentMetadata.updated
      expect(result).toEqual({
        didDocumentMetadata: { versionId: '2' },
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
              blockchainAccountId: `${controller}@eip155:1337`,
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
        '@context': [
          'https://www.w3.org/ns/did/v1',
          'https://identity.foundation/EcdsaSecp256k1RecoverySignature2020/lds-ecdsa-secp256k1-recovery2020-0.0.jsonld',
        ],
        id: pubdid,
        verificationMethod: [
          {
            id: `${pubdid}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: pubdid,
            blockchainAccountId: `${controller}@eip155:1337`,
          },
        ],
        authentication: [`${pubdid}#controller`],
      })
      expect(didDocument?.verificationMethod?.length).toBe(1)
      expect(didDocument?.authentication?.length).toBe(1)
    })
  })

  describe('delegates', () => {
    describe('add signing delegate', () => {
      it('resolves document', async () => {
        expect.assertions(1)
        await new EthrDidController(identity, registryContract).addDelegate('veriKey', delegate1, 86401, {
          from: controller,
        })
        const result = await didResolver.resolve(did)
        delete result.didDocumentMetadata.updated
        await expect(result).toEqual({
          didDocumentMetadata: { versionId: '3' },
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
                blockchainAccountId: `${controller}@eip155:1337`,
              },
              {
                id: `${did}#delegate-1`,
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: did,
                blockchainAccountId: `${delegate1}@eip155:1337`,
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
        const result = await didResolver.resolve(did)
        //don't compare against hardcoded timestamps
        delete result.didDocumentMetadata.updated
        expect(result).toEqual({
          didDocumentMetadata: { versionId: '4' },
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
                blockchainAccountId: `${controller}@eip155:1337`,
              },
              {
                id: `${did}#delegate-1`,
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: did,
                blockchainAccountId: `${delegate1}@eip155:1337`,
              },
              {
                id: `${did}#delegate-2`,
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: did,
                blockchainAccountId: `${delegate2}@eip155:1337`,
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
        await sleep(4)
        const result = await didResolver.resolve(did)
        //don't compare against hardcoded timestamps
        delete result.didDocumentMetadata.updated
        expect(result).toEqual({
          didDocumentMetadata: { versionId: '4' },
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
                blockchainAccountId: `${controller}@eip155:1337`,
              },
              {
                id: `${did}#delegate-1`,
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: did,
                blockchainAccountId: `${delegate1}@eip155:1337`,
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
        const result = await didResolver.resolve(did)
        //don't compare against hardcoded timestamps
        delete result.didDocumentMetadata.updated
        expect(result).toEqual({
          didDocumentMetadata: { versionId: '5' },
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
                blockchainAccountId: `${controller}@eip155:1337`,
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
        await new EthrDidController(identity, registryContract).addDelegate('sigAuth', delegate2, 86402, {
          from: controller,
        })
        const result = await didResolver.resolve(did)
        //don't compare against hardcoded timestamps
        delete result.didDocumentMetadata.updated
        expect(result).toEqual({
          didDocumentMetadata: { versionId: '6' },
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
                blockchainAccountId: `${controller}@eip155:1337`,
              },
              {
                id: `${did}#delegate-4`,
                type: 'EcdsaSecp256k1RecoveryMethod2020',
                controller: did,
                blockchainAccountId: `${delegate2}@eip155:1337`,
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
          86401,
          { from: controller }
        )
        const { didDocument } = await didResolver.resolve(did)
        expect(didDocument).toEqual({
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
              blockchainAccountId: `${controller}@eip155:1337`,
            },
            {
              id: `${did}#delegate-4`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              blockchainAccountId: `${delegate2}@eip155:1337`,
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
          86402,
          { from: controller }
        )
        const { didDocument } = await didResolver.resolve(did)
        expect(didDocument).toEqual({
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
              blockchainAccountId: `${controller}@eip155:1337`,
            },
            {
              id: `${did}#delegate-4`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              blockchainAccountId: `${delegate2}@eip155:1337`,
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
          86403,
          { from: controller }
        )
        const { didDocument } = await didResolver.resolve(did)
        expect(didDocument).toEqual({
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
              blockchainAccountId: `${controller}@eip155:1337`,
            },
            {
              id: `${did}#delegate-4`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              blockchainAccountId: `${delegate2}@eip155:1337`,
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
          86404,
          { from: keyAgreementController }
        )
        const { didDocument } = await didResolver.resolve(keyAgrDid)
        expect(didDocument).toEqual({
          '@context': [
            'https://www.w3.org/ns/did/v1',
            'https://identity.foundation/EcdsaSecp256k1RecoverySignature2020/lds-ecdsa-secp256k1-recovery2020-0.0.jsonld',
          ],
          id: keyAgrDid,
          verificationMethod: [
            {
              id: `${keyAgrDid}#controller`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: keyAgrDid,
              blockchainAccountId: `${keyAgreementController}@eip155:1337`,
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
          86405,
          { from: controller }
        )
        const { didDocument } = await didResolver.resolve(did)
        expect(didDocument).toEqual({
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
              blockchainAccountId: `${controller}@eip155:1337`,
            },
            {
              id: `${did}#delegate-4`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              blockchainAccountId: `${delegate2}@eip155:1337`,
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
            blockchainAccountId: `${controller}@eip155:1337`,
          },
          {
            id: `${did}#delegate-4`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: did,
            blockchainAccountId: `${delegate2}@eip155:1337`,
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
            blockchainAccountId: `${controller}@eip155:1337`,
          },
          {
            id: `${did}#delegate-4`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: did,
            blockchainAccountId: `${delegate2}@eip155:1337`,
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
            blockchainAccountId: `${controller}@eip155:1337`,
          },
          {
            id: `${did}#delegate-4`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: did,
            blockchainAccountId: `${delegate2}@eip155:1337`,
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
              blockchainAccountId: `${controller}@eip155:1337`,
            },
            {
              id: `${did}#delegate-4`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              blockchainAccountId: `${delegate2}@eip155:1337`,
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
        ethrDid.setAttribute(stringToBytes32('did/svc/TestService'), 'https://test.uport.me', 86406, {
          from: controller,
        }),
        ethrDid.setAttribute(stringToBytes32('did/svc/TestService'), 'https://test.uport.me', 86407, {
          from: controller,
        }),
        sleep(1).then(() => startMining(web3Provider)),
      ])
    })

    it('resolves document', async () => {
      expect.assertions(1)
      const result = await didResolver.resolve(did)
      //don't compare against hardcoded timestamps
      delete result.didDocumentMetadata.updated
      expect(result).toEqual({
        didDocumentMetadata: { versionId: '16' },
        didResolutionMetadata: {
          contentType: 'application/did+ld+json',
        },
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
              blockchainAccountId: `${controller}@eip155:1337`,
            },
            {
              id: `${did}#delegate-4`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              blockchainAccountId: `${delegate2}@eip155:1337`,
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
        ethrDid.setAttribute(stringToBytes32('did/svc/TestService2'), 'https://test2.uport.me', 86408, {
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
      const result = await didResolver.resolve(did)
      //don't compare against hardcoded timestamps
      delete result.didDocumentMetadata.updated
      expect(result).toEqual({
        didDocumentMetadata: { versionId: '18' },
        didResolutionMetadata: {
          contentType: 'application/did+ld+json',
        },
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
              blockchainAccountId: `${controller}@eip155:1337`,
            },
            {
              id: `${did}#delegate-4`,
              type: 'EcdsaSecp256k1RecoveryMethod2020',
              controller: did,
              blockchainAccountId: `${delegate2}@eip155:1337`,
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
      const lowAddress = accounts[5].toLowerCase()
      const checksumAddress = interpretIdentifier(lowAddress).address
      const lowDid = `did:ethr:dev:${lowAddress}`
      const checksumDid = `did:ethr:dev:${checksumAddress}`
      await new EthrDidController(lowAddress, registryContract).setAttribute(
        'did/pub/Secp256k1/veriKey/hex',
        '0x02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
        86409,
        { from: lowAddress }
      )
      const didDocumentLow = (await didResolver.resolve(lowDid)).didDocument
      const didDocumentChecksum = (await didResolver.resolve(checksumDid)).didDocument
      expect(lowDid).not.toEqual(checksumDid)
      expect(didDocumentLow).toBeDefined()
      //we don't care about the actual keys, only about their sameness
      expect(JSON.stringify(didDocumentLow).toLowerCase()).toEqual(JSON.stringify(didDocumentChecksum).toLowerCase())
    })

    it('adds sigAuth to authentication section (https://github.com/decentralized-identity/ethr-did-resolver/issues/95)', async () => {
      expect.assertions(1)
      const identity = accounts[4]
      const did = `did:ethr:dev:${identity}`
      const authPubKey = `31303866356238393330623164633235386162353765386630646362363932353963363162316166`
      await new EthrDidController(identity, registryContract).setAttribute(
        'did/pub/Ed25519/sigAuth/hex',
        `0x${authPubKey}`,
        86410,
        { from: identity }
      )
      const { didDocument } = await didResolver.resolve(did)
      expect(didDocument).toEqual({
        '@context': [
          'https://www.w3.org/ns/did/v1',
          'https://identity.foundation/EcdsaSecp256k1RecoverySignature2020/lds-ecdsa-secp256k1-recovery2020-0.0.jsonld',
        ],
        id: did,
        verificationMethod: [
          {
            id: `${did}#controller`,
            controller: did,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            blockchainAccountId: `${delegate2}@eip155:1337`,
          },
          {
            id: `${did}#delegate-1`,
            controller: did,
            type: `Ed25519VerificationKey2018`,
            publicKeyHex: authPubKey,
          },
        ],
        authentication: [`${did}#controller`, `${did}#delegate-1`],
      })
    })

    describe('Ed25519VerificationKey2018 in base58 (https://github.com/decentralized-identity/ethr-did-resolver/pull/106)', () => {
      it('resolves document', async () => {
        expect.assertions(1)
        const identity = accounts[3]
        const did = `did:ethr:dev:${identity}`
        const publicKeyHex = `b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71`
        const expectedPublicKeyBase58 = u8a.toString(u8a.fromString(publicKeyHex, 'base16'), 'base58btc')
        await new EthrDidController(identity, registryContract).setAttribute(
          'did/pub/Ed25519/veriKey/base58',
          `0x${publicKeyHex}`,
          86411,
          { from: identity }
        )
        const result = await didResolver.resolve(did)
        //don't compare against hardcoded timestamps
        delete result.didDocumentMetadata.updated
        expect(result).toEqual({
          didDocumentMetadata: { versionId: '21' },
          didResolutionMetadata: {
            contentType: 'application/did+ld+json',
          },
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
                blockchainAccountId: `${identity}@eip155:1337`,
              },
              {
                id: `${did}#delegate-1`,
                type: 'Ed25519VerificationKey2018',
                controller: did,
                publicKeyBase58: expectedPublicKeyBase58,
              },
            ],
            authentication: [`${did}#controller`],
          },
        })
      })
    })

    describe('can deactivate a DID (https://github.com/decentralized-identity/ethr-did-resolver/issues/83)', () => {
      it('resolves deactivated document', async () => {
        expect.assertions(1)
        const identity = accounts[6]
        const did = `did:ethr:dev:${identity}`
        await new EthrDidController(identity, registryContract).changeOwner(nullAddress, { from: identity })
        await expect(didResolver.resolve(did)).resolves.toEqual({
          didDocumentMetadata: {
            deactivated: true,
          },
          didResolutionMetadata: {
            contentType: 'application/did+ld+json',
          },
          didDocument: {
            '@context': 'https://www.w3.org/ns/did/v1',
            id: did,
            verificationMethod: [],
            authentication: [],
          },
        })
      })
    })

    describe('versioning', () => {
      it('can resolve virgin DID with versionId=latest', async () => {
        expect.assertions(1)
        const identity = '0xce3080168EE293053bA33b235D7116a3263D29f1'
        const did = `did:ethr:dev:${identity}`
        const didUrl = `${did}?versionId=latest`
        const result = await didResolver.resolve(didUrl)
        expect(result).toEqual({
          didDocumentMetadata: {},
          didResolutionMetadata: {
            contentType: 'application/did+ld+json',
          },
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
                blockchainAccountId: `${identity}@eip155:1337`,
              },
            ],
            authentication: [`${did}#controller`],
          },
        })
      })

      it('can resolve modified did with versionId=latest', async () => {
        expect.assertions(1)
        const identity = accounts[3]
        const did = `did:ethr:dev:${identity}`
        const didUrl = `${did}?versionId=latest`
        const publicKeyHex = `b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71`
        const expectedPublicKeyBase58 = u8a.toString(u8a.fromString(publicKeyHex, 'base16'), 'base58btc')
        const result = await didResolver.resolve(didUrl)
        //don't compare against hardcoded timestamps
        delete result.didDocumentMetadata.updated
        expect(result).toEqual({
          didDocumentMetadata: { versionId: '21' },
          didResolutionMetadata: {
            contentType: 'application/did+ld+json',
          },
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
                blockchainAccountId: `${identity}@eip155:1337`,
              },
              {
                id: `${did}#delegate-1`,
                type: 'Ed25519VerificationKey2018',
                controller: did,
                publicKeyBase58: expectedPublicKeyBase58,
              },
            ],
            authentication: [`${did}#controller`],
          },
        })
      })

      it.todo('can resolve did with versionId before an attribute change')
      it.todo('can resolve did with versionId before an attribute expiration')
      it.todo('can resolve did with versionId before a delegate change')
      it.todo('can resolve did with versionId before an owner change')
      it.todo('can resolve did with versionId before deactivation')
    })
  })
})

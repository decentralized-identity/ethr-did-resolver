import { Contract, ethers, hexlify, toUtf8Bytes } from 'ethers'
import { Resolvable } from 'did-resolver'

import { GanacheProvider } from '@ethers-ext/provider-ganache'
import { EthrDidController } from '../controller'
import { deployRegistry, randomAccount, sleep } from './testUtils'
import { stringToBytes32 } from '../helpers'

jest.setTimeout(30000)

describe('attributes', () => {
  let registryContract: Contract, didResolver: Resolvable, provider: GanacheProvider

  beforeAll(async () => {
    const reg = await deployRegistry()
    registryContract = reg.registryContract
    didResolver = reg.didResolver
    provider = reg.provider
  })

  describe('invoking createSetAttributeHash', () => {
    it('sets the "encodedValue" to the passed hex encoded string (e.g. a public key)', async () => {
      expect.assertions(3)
      const { address: identity, signer } = await randomAccount(provider)
      const { pubKey: attrValue } = await randomAccount(provider)
      const attrName = 'did/pub/Secp256k1/veriKey'
      const controller = new EthrDidController(identity, registryContract, signer)
      const encodeAttributeValueSpy = jest.spyOn(controller, 'encodeAttributeValue')
      const ttl = 11111
      await controller.createSetAttributeHash(attrName, attrValue, ttl)
      expect(encodeAttributeValueSpy).toHaveBeenCalledWith(attrValue)
      expect(encodeAttributeValueSpy).toHaveBeenCalledTimes(1)
      expect(encodeAttributeValueSpy).toHaveReturnedWith(attrValue)
    })

    it('sets the "encodedValue" to a bytes encoded version of the passed attribute value (e.g. a service endpoint)', async () => {
      expect.assertions(3)
      const { address: identity, signer } = await randomAccount(provider)
      const attrValue = 'https://hubs.uport.me/service-endpoints-are-not-hex'
      const attrName = 'did/pub/Secp256k1/veriKey'
      const controller = new EthrDidController(identity, registryContract, signer)
      const encodeAttributeValueSpy = jest.spyOn(controller, 'encodeAttributeValue')
      const ttl = 11111
      await controller.createSetAttributeHash(attrName, attrValue, ttl)
      expect(encodeAttributeValueSpy).toHaveBeenCalledWith(attrValue)
      expect(encodeAttributeValueSpy).toHaveBeenCalledTimes(1)
      const expectedEncodedValue = toUtf8Bytes(attrValue)
      expect(encodeAttributeValueSpy).toHaveReturnedWith(expectedEncodedValue)
    })
  })

  describe('invoking createRevokeAttributeHash', () => {
    beforeEach(() => {
      jest.clearAllMocks()
    })

    it('sets the "encodedValue" to the passed hex encoded string (e.g. a public key)', async () => {
      expect.assertions(3)
      const { address: identity, signer } = await randomAccount(provider)
      const { pubKey: attrValue } = await randomAccount(provider)
      const attrName = 'did/pub/Secp256k1/veriKey'
      const controller = new EthrDidController(identity, registryContract, signer)
      const encodeAttributeValueSpy = jest.spyOn(controller, 'encodeAttributeValue')
      await controller.createRevokeAttributeHash(attrName, attrValue)
      expect(encodeAttributeValueSpy).toHaveBeenCalledWith(attrValue)
      expect(encodeAttributeValueSpy).toHaveBeenCalledTimes(1)
      expect(encodeAttributeValueSpy).toHaveReturnedWith(attrValue)
    })

    it('sets the "encodedValue" to a bytes encoded version of the passed attribute value (e.g. a service endpoint)', async () => {
      expect.assertions(3)
      const { address: identity, signer } = await randomAccount(provider)
      const attrValue = 'https://hubs.uport.me/service-endpoints-are-not-hex'
      const attrName = 'did/pub/Secp256k1/veriKey'
      const controller = new EthrDidController(identity, registryContract, signer)
      const encodeAttributeValueSpy = jest.spyOn(controller, 'encodeAttributeValue')
      await controller.createRevokeAttributeHash(attrName, attrValue)
      expect(encodeAttributeValueSpy).toHaveBeenCalledWith(attrValue)
      expect(encodeAttributeValueSpy).toHaveBeenCalledTimes(1)
      const expectedEncodedValue = toUtf8Bytes(attrValue)
      expect(encodeAttributeValueSpy).toHaveReturnedWith(expectedEncodedValue)
    })
  })

  describe('add public keys', () => {
    it('add EcdsaSecp256k1VerificationKey2019 signing key', async () => {
      expect.assertions(1)
      const { address: identity, shortDID: did, signer } = await randomAccount(provider)
      const { pubKey } = await randomAccount(provider)
      await new EthrDidController(identity, registryContract, signer).setAttribute(
        'did/pub/Secp256k1/veriKey',
        pubKey,
        86401
      )
      const { didDocument } = await didResolver.resolve(did)
      expect(didDocument).toEqual({
        '@context': expect.anything(),
        id: did,
        verificationMethod: [
          {
            id: `${did}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: did,
            blockchainAccountId: `eip155:1337:${identity}`,
          },
          {
            id: `${did}#delegate-1`,
            type: 'EcdsaSecp256k1VerificationKey2019',
            controller: did,
            publicKeyHex: pubKey.slice(2),
          },
        ],
        authentication: [`${did}#controller`],
        assertionMethod: [`${did}#controller`, `${did}#delegate-1`],
      })
    })

    it('add Bls12381G2Key2020 assertion key', async () => {
      expect.assertions(1)
      const { address: identity, shortDID: did, signer } = await randomAccount(provider)
      const pubKey = hexlify(toUtf8Bytes('public key material here')) // encodes to 0x7075626c6963206b6579206d6174657269616c2068657265 in base16
      await new EthrDidController(identity, registryContract, signer).setAttribute(
        'did/pub/Bls12381G2Key2020', // attrName must fit into 32 bytes. Anything extra will be truncated.
        pubKey, // There's no limit on the size of the public key material
        86401
      )
      const { didDocument } = await didResolver.resolve(did)
      expect(didDocument).toEqual({
        '@context': expect.anything(),
        id: did,
        verificationMethod: [
          {
            id: `${did}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: did,
            blockchainAccountId: `eip155:1337:${identity}`,
          },
          {
            id: `${did}#delegate-1`,
            type: 'Bls12381G2Key2020',
            controller: did,
            publicKeyHex: '7075626c6963206b6579206d6174657269616c2068657265',
          },
        ],
        authentication: [`${did}#controller`],
        assertionMethod: [`${did}#controller`, `${did}#delegate-1`],
      })
    })

    it('add Ed25519VerificationKey2018 authentication key', async () => {
      expect.assertions(1)
      const { address: identity, shortDID: did, signer } = await randomAccount(provider)
      const { pubKey } = await randomAccount(provider)
      await new EthrDidController(identity, registryContract, signer).setAttribute(
        'did/pub/Ed25519/sigAuth/base64',
        pubKey,
        86402
      )
      const { didDocument } = await didResolver.resolve(did)
      expect(didDocument).toEqual({
        '@context': expect.anything(),
        id: did,
        verificationMethod: [
          {
            id: `${did}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: did,
            blockchainAccountId: `eip155:1337:${identity}`,
          },
          {
            id: `${did}#delegate-1`,
            type: 'Ed25519VerificationKey2018',
            controller: did,
            publicKeyBase64: ethers.encodeBase64(pubKey),
          },
        ],
        authentication: [`${did}#controller`, `${did}#delegate-1`],
        assertionMethod: [`${did}#controller`, `${did}#delegate-1`],
      })
    })

    it('add RSAVerificationKey2018 signing key', async () => {
      expect.assertions(1)
      const { address: identity, shortDID: did, signer } = await randomAccount(provider)
      await new EthrDidController(identity, registryContract, signer).setAttribute(
        'did/pub/RSA/veriKey/pem',
        '-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n',
        86403
      )
      const { didDocument } = await didResolver.resolve(did)
      expect(didDocument).toEqual({
        '@context': expect.anything(),
        id: did,
        verificationMethod: [
          {
            id: `${did}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: did,
            blockchainAccountId: `eip155:1337:${identity}`,
          },
          {
            id: `${did}#delegate-1`,
            type: 'RSAVerificationKey2018',
            controller: did,
            publicKeyPem: '-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n',
          },
        ],
        authentication: [`${did}#controller`],
        assertionMethod: [`${did}#controller`, `${did}#delegate-1`],
      })
    })

    it('add X25519KeyAgreementKey2019 encryption key', async () => {
      expect.assertions(1)
      const { address: identity, shortDID: did, signer } = await randomAccount(provider)
      const pubKeyBase64 = 'MCowBQYDK2VuAyEAEYVXd3/7B4d0NxpSsA/tdVYdz5deYcR1U+ZkphdmEFI='
      await new EthrDidController(did, registryContract, signer).setAttribute(
        'did/pub/X25519/enc/base64',
        ethers.hexlify(ethers.decodeBase64(pubKeyBase64)),
        86404
      )
      const { didDocument } = await didResolver.resolve(did)
      expect(didDocument).toEqual({
        '@context': expect.anything(),
        id: did,
        verificationMethod: [
          {
            id: `${did}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: did,
            blockchainAccountId: `eip155:1337:${identity}`,
          },
          {
            id: `${did}#delegate-1`,
            type: 'X25519KeyAgreementKey2019',
            controller: did,
            publicKeyBase64: pubKeyBase64,
          },
        ],
        authentication: [`${did}#controller`],
        assertionMethod: [`${did}#controller`],
        keyAgreement: [`${did}#delegate-1`],
      })
    })

    it('add an imaginary key type', async () => {
      expect.assertions(1)
      const { address: identity, shortDID: did, signer } = await randomAccount(provider)
      const imaginaryKey = '0x1234567890'
      await new EthrDidController(did, registryContract, signer).setAttribute(
        'did/pub/ImaginaryKey2023/veriKey',
        imaginaryKey,
        86404
      )
      const { didDocument } = await didResolver.resolve(did)
      expect(didDocument).toEqual({
        '@context': expect.anything(),
        id: did,
        verificationMethod: [
          {
            id: `${did}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: did,
            blockchainAccountId: `eip155:1337:${identity}`,
          },
          {
            id: `${did}#delegate-1`,
            type: 'ImaginaryKey2023',
            controller: did,
            publicKeyHex: imaginaryKey.slice(2),
          },
        ],
        authentication: [`${did}#controller`],
        // This is a bug. Encryption keys should not be added to assertionMethod See #184
        assertionMethod: [`${did}#controller`, `${did}#delegate-1`],
      })
    })
  })

  describe('add service endpoints', () => {
    it('resolves document', async () => {
      expect.assertions(1)
      const { address: identity, shortDID: did, signer } = await randomAccount(provider)
      await new EthrDidController(identity, registryContract, signer).setAttribute(
        stringToBytes32('did/svc/HubService'),
        'https://hubs.uport.me',
        86405
      )
      const { didDocument } = await didResolver.resolve(did)
      expect(didDocument).toEqual({
        '@context': expect.anything(),
        id: did,
        verificationMethod: [
          {
            id: `${did}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: did,
            blockchainAccountId: `eip155:1337:${identity}`,
          },
        ],
        authentication: [`${did}#controller`],
        assertionMethod: [`${did}#controller`],
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

  describe('add expanded service endpoints', () => {
    it('resolves document', async () => {
      expect.assertions(2)
      const { address: identity, shortDID: did, signer } = await randomAccount(provider)
      await new EthrDidController(identity, registryContract, signer).setAttribute(
        stringToBytes32('did/svc/HubService'),
        JSON.stringify({ uri: 'https://hubs.uport.me', transportType: 'http' }),
        86405
      )
      const { didDocument } = await didResolver.resolve(did)
      expect(didDocument).toEqual({
        '@context': expect.anything(),
        id: did,
        verificationMethod: [
          {
            id: `${did}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: did,
            blockchainAccountId: `eip155:1337:${identity}`,
          },
        ],
        authentication: [expect.anything()],
        assertionMethod: [expect.anything()],
        service: [
          {
            id: `${did}#service-1`,
            type: 'HubService',
            serviceEndpoint: { uri: 'https://hubs.uport.me', transportType: 'http' },
          },
        ],
      })

      await new EthrDidController(identity, registryContract, signer).setAttribute(
        stringToBytes32('did/svc/HubService'),
        JSON.stringify([
          { uri: 'https://hubs.uport.me', transportType: 'http' },
          { uri: 'libp2p.star/123', transportType: 'libp2p' },
        ]),
        86405
      )
      const { didDocument: updatedDidDocument } = await didResolver.resolve(did)
      expect(updatedDidDocument).toEqual({
        '@context': expect.anything(),
        id: did,
        verificationMethod: [expect.anything()],
        authentication: [expect.anything()],
        assertionMethod: [expect.anything()],
        service: [
          {
            id: `${did}#service-1`,
            type: 'HubService',
            serviceEndpoint: { uri: 'https://hubs.uport.me', transportType: 'http' },
          },
          {
            id: `${did}#service-2`,
            type: 'HubService',
            serviceEndpoint: [
              { uri: 'https://hubs.uport.me', transportType: 'http' },
              { uri: 'libp2p.star/123', transportType: 'libp2p' },
            ],
          },
        ],
      })
    })
  })

  describe('revoke attributes', () => {
    it('revoke EcdsaSecp256k1VerificationKey2019 signing key', async () => {
      expect.assertions(2)
      const { address: identity, shortDID: did, signer } = await randomAccount(provider)
      const { pubKey } = await randomAccount(provider)
      await new EthrDidController(identity, registryContract, signer).setAttribute(
        'did/pub/Secp256k1/veriKey',
        pubKey,
        86401
      )
      const { didDocument: didDocumentBefore } = await didResolver.resolve(did)
      expect(didDocumentBefore).toEqual({
        '@context': expect.anything(),
        id: did,
        verificationMethod: [
          {
            id: `${did}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: did,
            blockchainAccountId: `eip155:1337:${identity}`,
          },
          {
            id: `${did}#delegate-1`,
            type: 'EcdsaSecp256k1VerificationKey2019',
            controller: did,
            publicKeyHex: pubKey.slice(2),
          },
        ],
        authentication: [`${did}#controller`],
        assertionMethod: [`${did}#controller`, `${did}#delegate-1`],
      })

      await new EthrDidController(identity, registryContract, signer).revokeAttribute(
        'did/pub/Secp256k1/veriKey',
        pubKey
      )

      const { didDocument: didDocumentAfter } = await didResolver.resolve(did)
      expect(didDocumentAfter).toEqual({
        '@context': expect.anything(),
        id: did,
        verificationMethod: [
          {
            id: `${did}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: did,
            blockchainAccountId: `eip155:1337:${identity}`,
          },
        ],
        authentication: [`${did}#controller`],
        assertionMethod: [`${did}#controller`],
      })
    })

    it('revokes Ed25519VerificationKey2018 authentication key', async () => {
      expect.assertions(2)
      const { address: identity, shortDID: did, signer } = await randomAccount(provider)
      const { pubKey } = await randomAccount(provider)
      await new EthrDidController(identity, registryContract, signer).setAttribute(
        'did/pub/Ed25519/sigAuth/base64',
        pubKey,
        86402
      )
      const { didDocument: didDocumentBefore } = await didResolver.resolve(did)
      expect(didDocumentBefore).toEqual({
        '@context': expect.anything(),
        id: did,
        verificationMethod: [
          {
            id: `${did}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: did,
            blockchainAccountId: `eip155:1337:${identity}`,
          },
          {
            id: `${did}#delegate-1`,
            type: 'Ed25519VerificationKey2018',
            controller: did,
            publicKeyBase64: ethers.encodeBase64(pubKey),
          },
        ],
        authentication: [`${did}#controller`, `${did}#delegate-1`],
        assertionMethod: [`${did}#controller`, `${did}#delegate-1`],
      })
      await new EthrDidController(identity, registryContract, signer).revokeAttribute(
        'did/pub/Ed25519/sigAuth/base64',
        pubKey
      )
      const { didDocument: didDocumentAfter } = await didResolver.resolve(did)
      expect(didDocumentAfter).toEqual({
        '@context': expect.anything(),
        id: did,
        verificationMethod: [
          {
            id: `${did}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: did,
            blockchainAccountId: `eip155:1337:${identity}`,
          },
        ],
        authentication: [`${did}#controller`],
        assertionMethod: [`${did}#controller`],
      })
    })

    it('revokes service endpoint', async () => {
      expect.assertions(2)
      const { address: identity, shortDID: did, signer } = await randomAccount(provider)
      await new EthrDidController(identity, registryContract, signer).setAttribute(
        stringToBytes32('did/svc/HubService'),
        'https://hubs.uport.me',
        86405
      )
      const { didDocument: didDocumentBefore } = await didResolver.resolve(did)
      expect(didDocumentBefore).toEqual({
        '@context': expect.anything(),
        id: did,
        verificationMethod: [
          {
            id: `${did}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: did,
            blockchainAccountId: `eip155:1337:${identity}`,
          },
        ],
        authentication: [`${did}#controller`],
        assertionMethod: [`${did}#controller`],
        service: [
          {
            id: `${did}#service-1`,
            type: 'HubService',
            serviceEndpoint: 'https://hubs.uport.me',
          },
        ],
      })

      await new EthrDidController(identity, registryContract, signer).revokeAttribute(
        stringToBytes32('did/svc/HubService'),
        'https://hubs.uport.me'
      )

      const { didDocument: didDocumentAfter } = await didResolver.resolve(did)
      expect(didDocumentAfter).toEqual({
        '@context': expect.anything(),
        id: did,
        verificationMethod: [
          {
            id: `${did}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: did,
            blockchainAccountId: `eip155:1337:${identity}`,
          },
        ],
        authentication: [`${did}#controller`],
        assertionMethod: [`${did}#controller`],
      })
    })

    it('expires key automatically', async () => {
      expect.assertions(2)
      const { address: identity, shortDID: did, signer } = await randomAccount(provider)
      const { pubKey } = await randomAccount(provider)
      const validitySeconds = 2
      await new EthrDidController(identity, registryContract, signer).setAttribute(
        'did/pub/Ed25519/sigAuth',
        pubKey,
        validitySeconds
      )
      const { didDocument: didDocumentBefore } = await didResolver.resolve(did)
      expect(didDocumentBefore).toEqual({
        '@context': expect.anything(),
        id: did,
        verificationMethod: [
          {
            id: `${did}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: did,
            blockchainAccountId: `eip155:1337:${identity}`,
          },
          {
            id: `${did}#delegate-1`,
            type: 'Ed25519VerificationKey2018',
            controller: did,
            publicKeyHex: pubKey.slice(2),
          },
        ],
        authentication: [`${did}#controller`, `${did}#delegate-1`],
        assertionMethod: [`${did}#controller`, `${did}#delegate-1`],
      })
      await sleep((validitySeconds + 1) * 1000)

      const { didDocument: didDocumentAfter } = await didResolver.resolve(did)
      expect(didDocumentAfter).toEqual({
        '@context': expect.anything(),
        id: did,
        verificationMethod: [
          {
            id: `${did}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: did,
            blockchainAccountId: `eip155:1337:${identity}`,
          },
        ],
        authentication: [`${did}#controller`],
        assertionMethod: [`${did}#controller`],
      })
    })
  })
})

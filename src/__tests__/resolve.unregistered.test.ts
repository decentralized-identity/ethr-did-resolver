import { Resolvable } from 'did-resolver'

import { GanacheProvider } from '@ethers-ext/provider-ganache'
import { deployRegistry, randomAccount } from './testUtils'

jest.setTimeout(30000)

describe('unregistered DIDs', () => {
  let didResolver: Resolvable, provider: GanacheProvider

  beforeAll(async () => {
    const reg = await deployRegistry()
    didResolver = reg.didResolver
    provider = reg.provider
  })

  it('resolves doc with ethereum address identifier', async () => {
    expect.assertions(1)
    const { address, shortDID } = await randomAccount(provider)

    await expect(didResolver.resolve(shortDID)).resolves.toEqual({
      didDocumentMetadata: {},
      didResolutionMetadata: { contentType: 'application/did+ld+json' },
      didDocument: {
        '@context': expect.anything(),
        id: shortDID,
        verificationMethod: [
          {
            id: `${shortDID}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: shortDID,
            blockchainAccountId: `eip155:1337:${address}`,
          },
        ],
        authentication: [`${shortDID}#controller`],
        assertionMethod: [`${shortDID}#controller`],
      },
    })
  })

  it('resolves document with publicKey identifier', async () => {
    expect.assertions(1)
    const { address, longDID, pubKey } = await randomAccount(provider)
    await expect(didResolver.resolve(longDID)).resolves.toEqual({
      didDocumentMetadata: {},
      didResolutionMetadata: { contentType: 'application/did+ld+json' },
      didDocument: {
        '@context': expect.anything(),
        id: longDID,
        verificationMethod: [
          {
            id: `${longDID}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: longDID,
            blockchainAccountId: `eip155:1337:${address}`,
          },
          {
            id: `${longDID}#controllerKey`,
            type: 'EcdsaSecp256k1VerificationKey2019',
            controller: longDID,
            publicKeyHex: pubKey.slice(2),
          },
        ],
        authentication: [`${longDID}#controller`, `${longDID}#controllerKey`],
        assertionMethod: [`${longDID}#controller`, `${longDID}#controllerKey`],
      },
    })
  })

  it('resolves document with `accept` resolution option = JSON', async () => {
    expect.assertions(1)
    const { address, longDID: pubdid, pubKey } = await randomAccount(provider)
    await expect(didResolver.resolve(pubdid, { accept: 'application/did+json' })).resolves.toEqual({
      didDocumentMetadata: {},
      didResolutionMetadata: { contentType: 'application/did+json' },
      didDocument: {
        id: pubdid,
        verificationMethod: [
          {
            id: `${pubdid}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: pubdid,
            blockchainAccountId: `eip155:1337:${address}`,
          },
          {
            id: `${pubdid}#controllerKey`,
            type: 'EcdsaSecp256k1VerificationKey2019',
            controller: pubdid,
            publicKeyHex: pubKey.slice(2),
          },
        ],
        authentication: [`${pubdid}#controller`, `${pubdid}#controllerKey`],
        assertionMethod: [`${pubdid}#controller`, `${pubdid}#controllerKey`],
      },
    })
  })

  it('resolves document with `accept` resolution option = application/did+ld+json', async () => {
    expect.assertions(1)
    const { address, longDID: pubdid, pubKey } = await randomAccount(provider)
    await expect(didResolver.resolve(pubdid, { accept: 'application/did+ld+json' })).resolves.toEqual({
      didDocumentMetadata: {},
      didResolutionMetadata: { contentType: 'application/did+ld+json' },
      didDocument: {
        id: pubdid,
        verificationMethod: [
          {
            id: `${pubdid}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: pubdid,
            blockchainAccountId: `eip155:1337:${address}`,
          },
          {
            id: `${pubdid}#controllerKey`,
            type: 'EcdsaSecp256k1VerificationKey2019',
            controller: pubdid,
            publicKeyHex: pubKey.slice(2),
          },
        ],
        authentication: [`${pubdid}#controller`, `${pubdid}#controllerKey`],
        assertionMethod: [`${pubdid}#controller`, `${pubdid}#controllerKey`],
        '@context': [
          'https://www.w3.org/ns/did/v1',
          'https://w3id.org/security/suites/secp256k1recovery-2020/v2',
          'https://w3id.org/security/v3-unstable',
        ],
      },
    })
  })
})

import { Contract } from 'ethers'
import { Resolvable } from 'did-resolver'

import { GanacheProvider } from '@ethers-ext/provider-ganache'
import { EthrDidController } from '../controller'
import { deployRegistry, randomAccount, sleep } from './testUtils'

jest.setTimeout(30000)

describe('delegates', () => {
  let registryContract: Contract, didResolver: Resolvable, provider: GanacheProvider

  beforeAll(async () => {
    const reg = await deployRegistry()
    registryContract = reg.registryContract
    didResolver = reg.didResolver
    provider = reg.provider
  })

  it('add signing delegate', async () => {
    expect.assertions(2)
    const blockHeightBeforeChange = (await provider.getBlock('latest'))!.number
    const { address: identity, shortDID: did, signer } = await randomAccount(provider)
    const { address: signingDelegate } = await randomAccount(provider)

    await new EthrDidController(identity, registryContract, signer).addDelegate('veriKey', signingDelegate, 86401)
    const result = await didResolver.resolve(did)
    expect(parseInt(result?.didDocumentMetadata.versionId ?? '')).toBeGreaterThanOrEqual(blockHeightBeforeChange + 1)
    expect(result).toEqual({
      didDocumentMetadata: { versionId: expect.anything(), updated: expect.anything() },
      didResolutionMetadata: { contentType: 'application/did+ld+json' },
      didDocument: {
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
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: did,
            blockchainAccountId: `eip155:1337:${signingDelegate}`,
          },
        ],
        authentication: [`${did}#controller`],
        assertionMethod: [`${did}#controller`, `${did}#delegate-1`],
      },
    })
  })

  it('add auth delegate', async () => {
    expect.assertions(2)
    const { address: identity, shortDID: did, signer } = await randomAccount(provider)
    const { address: authDelegate } = await randomAccount(provider)
    const blockHeightBeforeChange = (await provider.getBlock('latest'))!.number
    await new EthrDidController(identity, registryContract, signer).addDelegate('sigAuth', authDelegate, 2)
    const result = await didResolver.resolve(did)
    expect(parseInt(result?.didDocumentMetadata.versionId ?? '')).toBeGreaterThanOrEqual(blockHeightBeforeChange + 1)
    expect(result).toEqual({
      didDocumentMetadata: { versionId: expect.anything(), updated: expect.anything() },
      didResolutionMetadata: { contentType: 'application/did+ld+json' },
      didDocument: {
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
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: did,
            blockchainAccountId: `eip155:1337:${authDelegate}`,
          },
        ],
        authentication: [`${did}#controller`, `${did}#delegate-1`],
        assertionMethod: [`${did}#controller`, `${did}#delegate-1`],
      },
    })
  })

  it('expire delegate automatically', async () => {
    expect.assertions(2)
    const { address: identity, shortDID: did, signer } = await randomAccount(provider)
    const { address: expiringDelegate } = await randomAccount(provider)
    const validitySeconds = 2
    await new EthrDidController(identity, registryContract, signer).addDelegate(
      'veriKey',
      expiringDelegate,
      validitySeconds
    )
    const result = await didResolver.resolve(did)
    expect(result.didDocument).toEqual({
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
          type: 'EcdsaSecp256k1RecoveryMethod2020',
          controller: did,
          blockchainAccountId: `eip155:1337:${expiringDelegate}`,
        },
      ],
      authentication: [`${did}#controller`],
      assertionMethod: [`${did}#controller`, `${did}#delegate-1`],
    })
    await sleep((validitySeconds + 1) * 1000)
    const result2 = await didResolver.resolve(did)
    expect(result2.didDocument).toEqual({
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

  it('revoke delegate', async () => {
    expect.assertions(2)
    const { address: identity, shortDID: did, signer } = await randomAccount(provider)
    const { address: signingDelegate } = await randomAccount(provider)
    await new EthrDidController(identity, registryContract, signer).addDelegate('veriKey', signingDelegate, 86400)
    const resultBefore = await didResolver.resolve(did)
    expect(resultBefore.didDocument).toEqual({
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
          type: 'EcdsaSecp256k1RecoveryMethod2020',
          controller: did,
          blockchainAccountId: `eip155:1337:${signingDelegate}`,
        },
      ],
      authentication: [`${did}#controller`],
      assertionMethod: [`${did}#controller`, `${did}#delegate-1`],
    })
    await new EthrDidController(identity, registryContract, signer).revokeDelegate('veriKey', signingDelegate)
    await sleep(1000)
    const result = await didResolver.resolve(did)
    expect(result.didDocument).toEqual({
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

  it('re-add auth delegate', async () => {
    expect.assertions(1)
    const { address: identity, shortDID: did, signer } = await randomAccount(provider)
    const { address: authDelegate } = await randomAccount(provider)
    await new EthrDidController(identity, registryContract, signer).addDelegate('sigAuth', authDelegate, 300)
    await new EthrDidController(identity, registryContract, signer).revokeDelegate('sigAuth', authDelegate)
    await new EthrDidController(identity, registryContract, signer).addDelegate('sigAuth', authDelegate, 86402)
    const result = await didResolver.resolve(did)
    expect(result.didDocument).toEqual({
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
          id: `${did}#delegate-3`,
          type: 'EcdsaSecp256k1RecoveryMethod2020',
          controller: did,
          blockchainAccountId: `eip155:1337:${authDelegate}`,
        },
      ],
      authentication: [`${did}#controller`, `${did}#delegate-3`],
      assertionMethod: [`${did}#controller`, `${did}#delegate-3`],
    })
  })
})

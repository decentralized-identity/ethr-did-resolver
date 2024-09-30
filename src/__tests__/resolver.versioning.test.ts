import { Contract } from 'ethers'
import { Resolvable } from 'did-resolver'
import { EthrDidController } from '../controller'
import { nullAddress } from '../helpers'
import { deployRegistry, randomAccount, sleep } from './testUtils'
import { GanacheProvider } from '@ethers-ext/provider-ganache'

jest.setTimeout(30000)

describe('versioning', () => {
  let registryContract: Contract, didResolver: Resolvable, provider: GanacheProvider

  beforeAll(async () => {
    const reg = await deployRegistry()
    registryContract = reg.registryContract
    didResolver = reg.didResolver
    provider = reg.provider
  })

  it('can resolve virgin DID with versionId=latest', async () => {
    expect.assertions(1)
    const { address: virginAddress, shortDID: virginDID } = await randomAccount(provider)
    const result = await didResolver.resolve(`${virginDID}?versionId=latest`)
    expect(result).toEqual({
      didDocumentMetadata: {},
      didResolutionMetadata: {
        contentType: 'application/did+ld+json',
      },
      didDocument: {
        '@context': expect.anything(),
        id: virginDID,
        verificationMethod: [
          {
            id: `${virginDID}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: virginDID,
            blockchainAccountId: `eip155:1337:${virginAddress}`,
          },
        ],
        authentication: [`${virginDID}#controller`],
        assertionMethod: [`${virginDID}#controller`],
      },
    })
  })

  it('can resolve did with versionId before deactivation', async () => {
    expect.assertions(1)
    const { address, shortDID: deactivatedDid, signer } = await randomAccount(provider)
    await new EthrDidController(deactivatedDid, registryContract, signer).changeOwner(nullAddress)
    const { didDocumentMetadata } = await didResolver.resolve(deactivatedDid)
    const deactivationBlock = parseInt(didDocumentMetadata.versionId ?? '')
    const result = await didResolver.resolve(`${deactivatedDid}?versionId=${deactivationBlock - 1}`)
    expect(result).toEqual({
      didDocumentMetadata: {
        nextVersionId: `${deactivationBlock}`,
        nextUpdate: didDocumentMetadata.updated,
      },
      didResolutionMetadata: { contentType: 'application/did+ld+json' },
      didDocument: {
        '@context': expect.anything(),
        id: deactivatedDid,
        verificationMethod: [
          {
            id: `${deactivatedDid}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: deactivatedDid,
            blockchainAccountId: `eip155:1337:${address}`,
          },
        ],
        authentication: [`${deactivatedDid}#controller`],
        assertionMethod: [`${deactivatedDid}#controller`],
      },
    })
  })

  it('can resolve modified did with versionId=latest', async () => {
    expect.assertions(2)
    const { shortDID: identifier, signer } = await randomAccount(provider)
    const { address: newOwner } = await randomAccount(provider)
    const blockHeightBeforeChange = (await provider.getBlock('latest'))!.number
    await new EthrDidController(identifier, registryContract, signer).changeOwner(newOwner)
    const result = await didResolver.resolve(`${identifier}?versionId=latest`)
    expect(parseInt(result?.didDocumentMetadata.versionId ?? '')).toBeGreaterThanOrEqual(blockHeightBeforeChange + 1)
    expect(result).toEqual({
      didDocumentMetadata: { versionId: expect.anything(), updated: expect.anything() },
      didResolutionMetadata: expect.anything(),
      didDocument: {
        '@context': expect.anything(),
        id: identifier,
        verificationMethod: [
          {
            id: `${identifier}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: identifier,
            blockchainAccountId: `eip155:1337:${newOwner}`,
          },
        ],
        authentication: [`${identifier}#controller`],
        assertionMethod: [`${identifier}#controller`],
      },
    })
  })

  it('can resolve did with versionId before an attribute change', async () => {
    expect.assertions(1)

    const { address, shortDID: identifier, signer } = await randomAccount(provider)

    const blockHeightBeforeChange = (await provider.getBlock('latest'))!.number
    const ethrDid = new EthrDidController(identifier, registryContract, signer)
    await ethrDid.setAttribute('did/pub/Ed25519/veriKey/hex', `0x11111111`, 86411)
    await ethrDid.setAttribute('did/pub/Ed25519/veriKey/hex', `0x22222222`, 86412)

    const result = await didResolver.resolve(`${identifier}?versionId=${blockHeightBeforeChange + 1}`)
    expect(result).toEqual({
      didDocumentMetadata: {
        versionId: `${blockHeightBeforeChange + 1}`,
        nextVersionId: `${blockHeightBeforeChange + 2}`,
        updated: expect.anything(),
        nextUpdate: expect.anything(),
      },
      didResolutionMetadata: { contentType: 'application/did+ld+json' },
      didDocument: {
        '@context': expect.anything(),
        id: identifier,
        verificationMethod: [
          {
            id: `${identifier}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: identifier,
            blockchainAccountId: `eip155:1337:${address}`,
          },
          {
            id: `${identifier}#delegate-1`,
            type: 'Ed25519VerificationKey2018',
            controller: identifier,
            publicKeyHex: '11111111',
          },
        ],
        authentication: [`${identifier}#controller`],
        assertionMethod: [`${identifier}#controller`, `${identifier}#delegate-1`],
      },
    })
  })

  it('can resolve did with versionId before a delegate change', async () => {
    expect.assertions(1)
    const delegateAddress1 = '0x1111111100000000000000000000000000000001'
    const delegateAddress2 = '0x2222222200000000000000000000000000000002'
    const { address, shortDID: identifier, signer } = await randomAccount(provider)

    const ethrDid = new EthrDidController(identifier, registryContract, signer)
    const blockHeightBeforeChange = (await provider.getBlock('latest'))!.number
    await ethrDid.addDelegate('veriKey', delegateAddress1, 86401)
    await ethrDid.addDelegate('veriKey', delegateAddress2, 86402)

    const result = await didResolver.resolve(`${identifier}?versionId=${blockHeightBeforeChange + 1}`)
    expect(result).toEqual({
      didDocumentMetadata: {
        versionId: `${blockHeightBeforeChange + 1}`,
        nextVersionId: `${blockHeightBeforeChange + 2}`,
        updated: expect.anything(),
        nextUpdate: expect.anything(),
      },
      didResolutionMetadata: expect.anything(),
      didDocument: {
        '@context': expect.anything(),
        id: identifier,
        verificationMethod: [
          {
            id: `${identifier}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: identifier,
            blockchainAccountId: `eip155:1337:${address}`,
          },
          {
            id: `${identifier}#delegate-1`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: identifier,
            blockchainAccountId: `eip155:1337:${delegateAddress1}`,
          },
        ],
        authentication: [`${identifier}#controller`],
        assertionMethod: [`${identifier}#controller`, `${identifier}#delegate-1`],
      },
    })
  })

  it('can resolve did with versionId before an owner change', async () => {
    expect.assertions(1)
    const { address: originalOwner, shortDID: identifier, signer } = await randomAccount(provider)
    const { address: newOwner, signer: newSigner } = await randomAccount(provider)

    const blockHeightBeforeChange = (await provider.getBlock('latest'))!.number
    await new EthrDidController(identifier, registryContract, signer).changeOwner(newOwner)
    await new EthrDidController(identifier, registryContract, newSigner).changeOwner(originalOwner)
    const result = await didResolver.resolve(`${identifier}?versionId=${blockHeightBeforeChange + 1}`)
    expect(result).toEqual({
      didDocumentMetadata: {
        versionId: `${blockHeightBeforeChange + 1}`,
        nextVersionId: `${blockHeightBeforeChange + 2}`,
        updated: expect.anything(),
        nextUpdate: expect.anything(),
      },
      didResolutionMetadata: expect.anything(),
      didDocument: {
        '@context': expect.anything(),
        id: identifier,
        verificationMethod: [
          {
            id: `${identifier}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: identifier,
            blockchainAccountId: `eip155:1337:${newOwner}`,
          },
        ],
        authentication: [`${identifier}#controller`],
        assertionMethod: [`${identifier}#controller`],
      },
    })
  })

  it('can resolve did with versionId before an attribute expiration', async () => {
    expect.assertions(3)
    const delegate = '0xde1E9a7e00000000000000000000000000000001'
    const { address, shortDID: identifier, signer } = await randomAccount(provider)
    const validitySeconds = 2
    await new EthrDidController(identifier, registryContract, signer).addDelegate('sigAuth', delegate, validitySeconds)
    let result = await didResolver.resolve(identifier)
    // confirm delegate exists
    const versionBeforeExpiry = result.didDocumentMetadata.versionId
    expect(result?.didDocument?.verificationMethod?.[1]).toEqual({
      id: `${identifier}#delegate-1`,
      type: 'EcdsaSecp256k1RecoveryMethod2020',
      controller: identifier,
      blockchainAccountId: `eip155:1337:${delegate}`,
    })
    // await expiry
    await sleep((validitySeconds + 1) * 1000)
    // confirm delegate was removed after expiry
    result = await didResolver.resolve(identifier)
    expect(result?.didDocument?.verificationMethod?.length).toEqual(1)

    // resolve DID before expiry
    result = await didResolver.resolve(`${identifier}?versionId=${versionBeforeExpiry}`)
    expect(result).toEqual({
      didDocumentMetadata: { versionId: `${versionBeforeExpiry}`, updated: expect.anything() },
      didResolutionMetadata: expect.anything(),
      didDocument: {
        '@context': expect.anything(),
        id: identifier,
        verificationMethod: [
          {
            id: `${identifier}#controller`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: identifier,
            blockchainAccountId: `eip155:1337:${address}`,
          },
          {
            id: `${identifier}#delegate-1`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: identifier,
            blockchainAccountId: `eip155:1337:${delegate}`,
          },
        ],
        authentication: [`${identifier}#controller`, `${identifier}#delegate-1`],
        assertionMethod: [`${identifier}#controller`, `${identifier}#delegate-1`],
      },
    })
  })
})

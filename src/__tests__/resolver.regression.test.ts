import { Contract } from 'ethers'
import { Resolvable } from 'did-resolver'
import { EthrDidController } from '../controller'
import { interpretIdentifier, nullAddress } from '../helpers'
import { deployRegistry, randomAccount } from './testUtils'
import { GanacheProvider } from '@ethers-ext/provider-ganache'

jest.setTimeout(30000)

describe('regression', () => {
  let registryContract: Contract, didResolver: Resolvable, provider: GanacheProvider

  beforeAll(async () => {
    const reg = await deployRegistry()
    registryContract = reg.registryContract
    didResolver = reg.didResolver
    provider = reg.provider
  })

  it('resolves same document with case sensitive eth address (https://github.com/decentralized-identity/ethr-did-resolver/issues/105)', async () => {
    expect.assertions(3)
    const { address, signer } = await randomAccount(provider)
    const lowAddress = address.toLowerCase()
    const checksumAddress = interpretIdentifier(address).address
    const lowDid = `did:ethr:dev:${lowAddress}`
    const checksumDid = `did:ethr:dev:${checksumAddress}`
    await new EthrDidController(lowAddress, registryContract, signer).setAttribute(
      'did/pub/Secp256k1/veriKey/hex',
      '0x02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71',
      86409
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
    const { address, shortDID: identifier, signer } = await randomAccount(provider)
    const authPubKey = `31303866356238393330623164633235386162353765386630646362363932353963363162316166`
    await new EthrDidController(identifier, registryContract, signer).setAttribute(
      'did/pub/Ed25519/sigAuth/hex',
      `0x${authPubKey}`,
      86410
    )
    const { didDocument } = await didResolver.resolve(identifier)
    expect(didDocument).toEqual({
      '@context': expect.anything(),
      id: identifier,
      verificationMethod: [
        {
          id: `${identifier}#controller`,
          controller: identifier,
          type: 'EcdsaSecp256k1RecoveryMethod2020',
          blockchainAccountId: `eip155:1337:${address}`,
        },
        {
          id: `${identifier}#delegate-1`,
          controller: identifier,
          type: `Ed25519VerificationKey2018`,
          publicKeyHex: authPubKey,
        },
      ],
      authentication: [`${identifier}#controller`, `${identifier}#delegate-1`],
      assertionMethod: [`${identifier}#controller`, `${identifier}#delegate-1`],
    })
  })

  it('Ed25519VerificationKey2018 in base58 (https://github.com/decentralized-identity/ethr-did-resolver/pull/106)', async () => {
    expect.assertions(1)
    const { address, shortDID: identifier, signer } = await randomAccount(provider)
    const publicKeyHex = `b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71`
    const expectedPublicKeyBase58 = 'DV4G2kpBKjE6zxKor7Cj21iL9x9qyXb6emqjszBXcuhz'
    await new EthrDidController(identifier, registryContract, signer).setAttribute(
      'did/pub/Ed25519/veriKey/base58',
      `0x${publicKeyHex}`,
      86411
    )
    const result = await didResolver.resolve(identifier)
    expect(result.didDocument).toEqual({
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
          publicKeyBase58: expectedPublicKeyBase58,
        },
      ],
      authentication: [`${identifier}#controller`],
      assertionMethod: [`${identifier}#controller`, `${identifier}#delegate-1`],
    })
  })

  it('can deactivate a DID (https://github.com/decentralized-identity/ethr-did-resolver/issues/83)', async () => {
    expect.assertions(2)
    const { shortDID: identifier, signer } = await randomAccount(provider)
    const blockHeightBeforeChange = (await provider.getBlock('latest'))!.number
    await new EthrDidController(identifier, registryContract, signer).changeOwner(nullAddress)
    const result = await didResolver.resolve(identifier)
    expect(parseInt(result?.didDocumentMetadata.versionId ?? '')).toBeGreaterThanOrEqual(blockHeightBeforeChange + 1)
    expect(result).toEqual({
      didDocumentMetadata: {
        deactivated: true,
        updated: expect.anything(),
        versionId: expect.anything(),
      },
      didResolutionMetadata: expect.anything(),
      didDocument: {
        '@context': expect.anything(),
        id: identifier,
        verificationMethod: [],
        authentication: [],
        assertionMethod: [],
      },
    })
  })
})

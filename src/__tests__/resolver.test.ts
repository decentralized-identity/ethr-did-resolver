import { DIDDocument, DIDResolutionResult, Resolvable, Resolver } from 'did-resolver'
import { getResolver } from '../resolver'
jest.setTimeout(30000)

describe('ensResolver', () => {
  beforeAll(async () => {})

  it('works with single, unnamed network', async () => {
    expect.assertions(1)
    let didResolver: Resolvable = new Resolver(
      getResolver({ rpcUrl: 'https://ropsten.infura.io/v3/e471b8639c314004ae67ec0078f70102' })
    )
    const did = 'did:ens:oliver-rop.eth'
    const resolutionResult = await didResolver.resolve(did)
    expect(resolutionResult).toEqual<DIDResolutionResult>({
      didDocument: {
        id: did,
        service: [
          {
            id: `${did}#Web3PublicProfile-0x773230C8719783C18147F18BbB8340a347196eE5`,
            type: 'Web3PublicProfile',
            serviceEndpoint: 'oliver-rop.eth',
          },
        ],
        verificationMethod: [
          {
            id: `${did}#0x773230C8719783C18147F18BbB8340a347196eE5`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: did,
            blockchainAccountId: '0x773230C8719783C18147F18BbB8340a347196eE5@eip155:3',
          },
          {
            id: `${did}#my-id`,
            publicKeyMultibase: 'z9hFgmPVfmBZwRvFEyniQDBkz9LmV7gDEqytWyGZLmDXE',
            controller: did,
            type: 'X25519KeyAgreementKey2019',
          },
        ],
        authentication: [`${did}#0x773230C8719783C18147F18BbB8340a347196eE5`],
        capabilityDelegation: [`${did}#0x773230C8719783C18147F18BbB8340a347196eE5`],
        capabilityInvocation: [`${did}#0x773230C8719783C18147F18BbB8340a347196eE5`],
        assertionMethod: [`${did}#0x773230C8719783C18147F18BbB8340a347196eE5`],
        keyAgreement: [`${did}#my-id`],
      },
      didDocumentMetadata: {},
      didResolutionMetadata: { contentType: 'application/did+json' },
    })
  })

  it('works with single, named network', async () => {
    expect.assertions(1)
    let didResolver: Resolvable = new Resolver(
      getResolver({ name: 'ropsten', rpcUrl: 'https://ropsten.infura.io/v3/e471b8639c314004ae67ec0078f70102' })
    )
    const did = 'did:ens:ropsten:oliver-rop.eth'
    const result = await didResolver.resolve(did)
    expect(result.didDocument).toEqual<DIDDocument>({
      id: did,
      service: [
        {
          id: `${did}#Web3PublicProfile-0x773230C8719783C18147F18BbB8340a347196eE5`,
          type: 'Web3PublicProfile',
          serviceEndpoint: 'oliver-rop.eth',
        },
      ],
      verificationMethod: [
        {
          id: `${did}#0x773230C8719783C18147F18BbB8340a347196eE5`,
          type: 'EcdsaSecp256k1RecoveryMethod2020',
          controller: did,
          blockchainAccountId: '0x773230C8719783C18147F18BbB8340a347196eE5@eip155:3',
        },
        {
          id: `${did}#my-id`,
          publicKeyMultibase: 'z9hFgmPVfmBZwRvFEyniQDBkz9LmV7gDEqytWyGZLmDXE',
          controller: did,
          type: 'X25519KeyAgreementKey2019',
        },
      ],
      authentication: [`${did}#0x773230C8719783C18147F18BbB8340a347196eE5`],
      capabilityDelegation: [`${did}#0x773230C8719783C18147F18BbB8340a347196eE5`],
      capabilityInvocation: [`${did}#0x773230C8719783C18147F18BbB8340a347196eE5`],
      assertionMethod: [`${did}#0x773230C8719783C18147F18BbB8340a347196eE5`],
      keyAgreement: [`${did}#my-id`],
    })
  })

  it('works with infura', async () => {
    expect.assertions(1)
    let didResolver: Resolvable = new Resolver(getResolver({ infuraProjectId: 'e471b8639c314004ae67ec0078f70102' }))
    const did = 'did:ens:ropsten:oliver-rop.eth'
    const result = await didResolver.resolve(did)
    expect(result.didDocument).toEqual<DIDDocument>({
      id: did,
      service: [
        {
          id: `${did}#Web3PublicProfile-0x773230C8719783C18147F18BbB8340a347196eE5`,
          type: 'Web3PublicProfile',
          serviceEndpoint: 'oliver-rop.eth',
        },
      ],
      verificationMethod: [
        {
          id: `${did}#0x773230C8719783C18147F18BbB8340a347196eE5`,
          type: 'EcdsaSecp256k1RecoveryMethod2020',
          controller: did,
          blockchainAccountId: '0x773230C8719783C18147F18BbB8340a347196eE5@eip155:3',
        },
        {
          id: `${did}#my-id`,
          publicKeyMultibase: 'z9hFgmPVfmBZwRvFEyniQDBkz9LmV7gDEqytWyGZLmDXE',
          controller: did,
          type: 'X25519KeyAgreementKey2019',
        },
      ],
      authentication: [`${did}#0x773230C8719783C18147F18BbB8340a347196eE5`],
      capabilityDelegation: [`${did}#0x773230C8719783C18147F18BbB8340a347196eE5`],
      capabilityInvocation: [`${did}#0x773230C8719783C18147F18BbB8340a347196eE5`],
      assertionMethod: [`${did}#0x773230C8719783C18147F18BbB8340a347196eE5`],
      keyAgreement: [`${did}#my-id`],
    })
  })
})

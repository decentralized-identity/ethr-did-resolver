import { Contract } from 'ethers'
import { Resolvable } from 'did-resolver'

import { GanacheProvider } from '@ethers-ext/provider-ganache'
import { EthrDidController } from '../controller'
import { deployRegistry, randomAccount, sleep } from './testUtils'

jest.setTimeout(30000)

describe('meta transactions', () => {
  let registryContract: Contract, didResolver: Resolvable, provider: GanacheProvider

  beforeAll(async () => {
    const reg = await deployRegistry()
    registryContract = reg.registryContract
    didResolver = reg.didResolver
    provider = reg.provider
  })

  it('add delegate signed', async () => {
    const { address: identity, shortDID: did, privKey } = await randomAccount(provider)
    const { address: authDelegate } = await randomAccount(provider)

    const hash = await new EthrDidController(did, registryContract).createAddDelegateHash(
      'sigAuth',
      authDelegate,
      86400
    )
    const signature = privKey.sign(hash)

    await new EthrDidController(did, registryContract, await provider.getSigner(0)).addDelegateSigned(
      'sigAuth',
      authDelegate,
      86400,
      {
        sigV: signature.v,
        sigR: signature.r,
        sigS: signature.s,
      }
    )

    const result = await didResolver.resolve(did)
    expect(result.didDocument).toEqual({
      '@context': expect.anything(),
      id: did,
      verificationMethod: [
        {
          id: expect.anything(),
          type: expect.anything(),
          controller: expect.anything(),
          blockchainAccountId: `eip155:1337:${identity}`,
        },
        {
          id: expect.anything(),
          type: expect.anything(),
          controller: expect.anything(),
          blockchainAccountId: `eip155:1337:${authDelegate}`,
        },
      ],
      authentication: [`${did}#controller`, `${did}#delegate-1`],
      assertionMethod: [`${did}#controller`, `${did}#delegate-1`],
    })
  })

  it('revoke delegate signed', async () => {
    const { address: identity, shortDID: did, privKey, signer } = await randomAccount(provider)
    const { address: delegate } = await randomAccount(provider)

    await new EthrDidController(did, registryContract, signer).addDelegate('sigAuth', delegate, 86400)
    const resultBefore = await didResolver.resolve(did)
    expect(resultBefore?.didDocument?.verificationMethod?.length).toEqual(2)

    const hash = await new EthrDidController(did, registryContract).createRevokeDelegateHash('sigAuth', delegate)
    const signature = privKey.sign(hash)

    await new EthrDidController(did, registryContract, await provider.getSigner(0)).revokeDelegateSigned(
      'sigAuth',
      delegate,
      {
        sigV: signature.v,
        sigR: signature.r,
        sigS: signature.s,
      }
    )
    await sleep(1000)

    const result = await didResolver.resolve(did)
    expect(result.didDocument).toEqual({
      '@context': expect.anything(),
      id: did,
      verificationMethod: [
        {
          id: expect.anything(),
          type: expect.anything(),
          controller: expect.anything(),
          blockchainAccountId: `eip155:1337:${identity}`,
        },
      ],
      authentication: expect.anything(),
      assertionMethod: expect.anything(),
    })
  })

  it('set attribute signed', async () => {
    const { shortDID: identifier, privKey, signer } = await randomAccount(provider)

    const serviceEndpointParams = { uri: 'https://didcomm.example.com', transportType: 'http' }
    const attributeName = 'did/svc/testService'
    const attributeValue = JSON.stringify(serviceEndpointParams)
    const attributeExpiration = 86400

    const hash = await new EthrDidController(identifier, registryContract).createSetAttributeHash(
      attributeName,
      attributeValue,
      attributeExpiration
    )
    const signature = privKey.sign(hash)

    await new EthrDidController(identifier, registryContract, await provider.getSigner(0)).setAttributeSigned(
      attributeName,
      attributeValue,
      attributeExpiration,
      {
        sigV: signature.v,
        sigR: signature.r,
        sigS: signature.s,
      }
    )

    const result = await didResolver.resolve(identifier)
    expect(result.didDocument).toEqual({
      '@context': expect.anything(),
      id: identifier,
      verificationMethod: expect.anything(),
      authentication: [expect.anything()],
      assertionMethod: [expect.anything()],
      service: [
        {
          id: expect.anything(),
          type: 'testService',
          serviceEndpoint: {
            uri: serviceEndpointParams.uri,
            transportType: serviceEndpointParams.transportType,
          },
        },
      ],
    })
  })

  it('revoke attribute signed', async () => {
    const { address: identity, shortDID: identifier, privKey, signer } = await randomAccount(provider)

    const serviceEndpointParams = { uri: 'https://didcomm.example.com', transportType: 'http' }
    const attributeName = 'did/svc/testService'
    const attributeValue = JSON.stringify(serviceEndpointParams)
    const attributeExpiration = 86400

    await new EthrDidController(identity, registryContract, signer).setAttribute(
      attributeName,
      attributeValue,
      attributeExpiration
    )

    const resultBefore = await didResolver.resolve(identifier)
    expect(resultBefore?.didDocument?.service?.length).toEqual(1)

    const hash = await new EthrDidController(identifier, registryContract).createRevokeAttributeHash(
      attributeName,
      attributeValue
    )
    const signature = privKey.sign(hash)

    await new EthrDidController(identifier, registryContract, await provider.getSigner(0)).revokeAttributeSigned(
      attributeName,
      attributeValue,
      {
        sigV: signature.v,
        sigR: signature.r,
        sigS: signature.s,
      }
    )

    // Wait for the event to be emitted
    await sleep(1000)

    const result = await didResolver.resolve(identifier)
    expect(result.didDocument).toEqual({
      '@context': expect.anything(),
      id: identifier,
      verificationMethod: expect.anything(),
      authentication: [expect.anything()],
      assertionMethod: [expect.anything()],
    })
  })

  it('change owner signed', async () => {
    const { address: identity, shortDID: identifier, privKey: originalPrivKey } = await randomAccount(provider)
    const { address: newOwner, privKey: newOwnerKey } = await randomAccount(provider)

    const hash = await new EthrDidController(identifier, registryContract).createChangeOwnerHash(newOwner)
    const signature = originalPrivKey.sign(hash)

    await new EthrDidController(identifier, registryContract, await provider.getSigner(0)).changeOwnerSigned(newOwner, {
      sigV: signature.v,
      sigR: signature.r,
      sigS: signature.s,
    })

    const result = await didResolver.resolve(identifier)
    expect(result.didDocument).toEqual({
      '@context': expect.anything(),
      id: identifier,
      verificationMethod: [
        {
          id: `${identifier}#controller`,
          type: expect.anything(),
          controller: expect.anything(),
          blockchainAccountId: `eip155:1337:${newOwner}`,
        },
      ],
      authentication: [expect.anything()],
      assertionMethod: [expect.anything()],
    })
  })

  it('set attribute signed (key)', async () => {
    const { address: identity, shortDID: identifier, privKey } = await randomAccount(provider)
    const { pubKey: signingKey } = await randomAccount(provider)

    const attributeName = 'did/pub/Secp256k1/veriKey/hex'
    const attributeValue = signingKey
    const attributeExpiration = 86400

    const hash = await new EthrDidController(identifier, registryContract).createSetAttributeHash(
      attributeName,
      attributeValue,
      attributeExpiration
    )

    const signature = privKey.sign(hash)

    await new EthrDidController(identifier, registryContract, await provider.getSigner(0)).setAttributeSigned(
      attributeName,
      attributeValue,
      attributeExpiration,
      {
        sigV: signature.v,
        sigR: signature.r,
        sigS: signature.s,
      }
    )
    const result = await didResolver.resolve(identifier)
    expect(result?.didDocument?.verificationMethod?.[1]).toEqual({
      controller: `${identifier}`,
      id: `${identifier}#delegate-1`,
      publicKeyHex: attributeValue.slice(2),
      type: 'EcdsaSecp256k1VerificationKey2019',
    })
  })
})

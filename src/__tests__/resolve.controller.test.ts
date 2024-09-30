import { Contract } from 'ethers'
import { Resolvable } from 'did-resolver'

import { GanacheProvider } from '@ethers-ext/provider-ganache'
import { EthrDidController } from '../controller'
import { deployRegistry, randomAccount } from './testUtils'

jest.setTimeout(30000)

describe('change identity owner', () => {
  let registryContract: Contract, didResolver: Resolvable, provider: GanacheProvider

  beforeAll(async () => {
    const reg = await deployRegistry()
    registryContract = reg.registryContract
    didResolver = reg.didResolver
    provider = reg.provider
  })

  it('resolves document', async () => {
    expect.assertions(2)
    const { shortDID: did, signer } = await randomAccount(provider)
    const { address: newOwner } = await randomAccount(provider)
    const blockHeightBeforeChange = (await provider.getBlock('latest'))!.number
    await new EthrDidController(did, registryContract, signer).changeOwner(newOwner)
    const result = await didResolver.resolve(did)
    expect(parseInt(result?.didDocumentMetadata.versionId ?? '')).toBeGreaterThanOrEqual(blockHeightBeforeChange + 1)
    expect(result.didDocument).toEqual({
      '@context': expect.anything(),
      id: did,
      verificationMethod: [
        {
          id: `${did}#controller`,
          type: 'EcdsaSecp256k1RecoveryMethod2020',
          controller: did,
          blockchainAccountId: `eip155:1337:${newOwner}`,
        },
      ],
      authentication: [`${did}#controller`],
      assertionMethod: [`${did}#controller`],
    })
  })

  it('changing controller invalidates the publicKey as identifier', async () => {
    expect.assertions(1)
    const { longDID: pubDID, signer } = await randomAccount(provider)
    const { address: newOwner } = await randomAccount(provider)

    await new EthrDidController(pubDID, registryContract, signer).changeOwner(newOwner)
    const { didDocument } = await didResolver.resolve(pubDID)
    expect(didDocument).toEqual({
      '@context': expect.anything(),
      id: pubDID,
      verificationMethod: [
        {
          id: `${pubDID}#controller`,
          type: 'EcdsaSecp256k1RecoveryMethod2020',
          controller: pubDID,
          blockchainAccountId: `eip155:1337:${newOwner}`,
        },
      ],
      authentication: [`${pubDID}#controller`],
      assertionMethod: [`${pubDID}#controller`],
    })
  })
})

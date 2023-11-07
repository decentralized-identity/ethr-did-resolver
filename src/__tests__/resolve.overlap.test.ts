import { Contract } from 'ethers'
import { Resolvable } from 'did-resolver'

import { GanacheProvider } from '@ethers-ext/provider-ganache'
import { EthrDidController } from '../controller'
import { deployRegistry, randomAccount, sleep, startMining, stopMining } from './testUtils'
import { stringToBytes32 } from '../helpers'

jest.setTimeout(30000)

describe('overlapping events', () => {
  let registryContract: Contract, didResolver: Resolvable, provider: GanacheProvider

  beforeAll(async () => {
    const reg = await deployRegistry()
    registryContract = reg.registryContract
    didResolver = reg.didResolver
    provider = reg.provider
  })

  it('adding the same service in the same block does not result in duplication', async () => {
    expect.assertions(2)

    const { address, shortDID: identifier, signer } = await randomAccount(provider)

    const ethrDid = new EthrDidController(identifier, registryContract, signer)
    const blockHeightBeforeChange = (await provider.getBlock('latest'))!.number
    await stopMining(provider)
    const tx1 = ethrDid.setAttribute(stringToBytes32('did/svc/TestService'), 'https://test.uport.me', 86406, {
      from: address,
    })
    const tx2 = ethrDid.setAttribute(stringToBytes32('did/svc/TestService'), 'https://test.uport.me', 86407, {
      from: address,
    })
    await sleep(1000)
    await startMining(provider)
    await tx1
    await tx2

    const result = await didResolver.resolve(identifier)
    expect(parseInt(result?.didDocumentMetadata.versionId ?? '')).toEqual(blockHeightBeforeChange + 1)
    expect(result).toEqual({
      didDocumentMetadata: { versionId: expect.anything(), updated: expect.anything() },
      didResolutionMetadata: expect.anything(),
      didDocument: {
        '@context': expect.anything(),
        id: identifier,
        verificationMethod: expect.anything(),
        authentication: expect.anything(),
        assertionMethod: expect.anything(),
        service: [
          {
            id: `${identifier}#service-2`,
            type: 'TestService',
            serviceEndpoint: 'https://test.uport.me',
          },
        ],
      },
    })
  })

  it('adding 2 services in 2 consecutive blocks should result in only 2 services appearing in the DID doc (no duplication)', async () => {
    expect.assertions(3)
    const { address, shortDID: identifier, signer } = await randomAccount(provider)

    const ethrDid = new EthrDidController(identifier, registryContract, signer)

    const blockHeightBeforeChange = (await provider.getBlock('latest'))!.number

    await ethrDid.setAttribute(stringToBytes32('did/svc/TestService1'), 'https://test1.uport.me', 86406)
    let result = await didResolver.resolve(identifier)
    expect(result.didDocumentMetadata.versionId).toEqual(`${blockHeightBeforeChange + 1}`)
    await ethrDid.setAttribute(stringToBytes32('did/svc/TestService2'), 'https://test2.uport.me', 86407)

    result = await didResolver.resolve(identifier)
    expect(result.didDocumentMetadata.versionId).toEqual(`${blockHeightBeforeChange + 2}`)
    expect(result.didDocument).toEqual({
      '@context': expect.anything(),
      id: identifier,
      verificationMethod: [expect.anything()],
      authentication: [expect.anything()],
      assertionMethod: [expect.anything()],
      service: [
        {
          id: `${identifier}#service-1`,
          type: 'TestService1',
          serviceEndpoint: 'https://test1.uport.me',
        },
        {
          id: `${identifier}#service-2`,
          type: 'TestService2',
          serviceEndpoint: 'https://test2.uport.me',
        },
      ],
    })
  })

  it('adding and removing a service in the same block should result in no change to the doc (correct order, same block)', async () => {
    expect.assertions(2)
    const { address, shortDID: identifier, signer } = await randomAccount(provider)

    const ethrDid = new EthrDidController(identifier, registryContract, signer)

    const blockHeightBeforeChange = (await provider.getBlock('latest'))!.number

    await stopMining(provider)
    const tx1 = ethrDid.setAttribute(stringToBytes32('did/svc/TestService1'), 'https://test1.uport.me', 86406)
    let result = await didResolver.resolve(identifier)
    expect(result.didDocumentMetadata.versionId).not.toBeDefined()
    const tx2 = ethrDid.revokeAttribute(stringToBytes32('did/svc/TestService1'), 'https://test1.uport.me')
    await sleep(1000).then(() => startMining(provider))
    await tx1
    await tx2

    result = await didResolver.resolve(identifier)
    expect(result).toEqual({
      didDocumentMetadata: { versionId: `${blockHeightBeforeChange + 1}`, updated: expect.anything() },
      didResolutionMetadata: expect.anything(),
      didDocument: {
        '@context': expect.anything(),
        id: identifier,
        verificationMethod: [expect.anything()],
        authentication: [expect.anything()],
        assertionMethod: [expect.anything()],
        service: undefined,
      },
    })
  })

  it('adding and removing a service in 2 consecutive blocks should result in no change to the doc (correct order 2 blocks).', async () => {
    expect.assertions(2)
    const { shortDID: identifier, signer } = await randomAccount(provider)

    const ethrDid = new EthrDidController(identifier, registryContract, signer)

    const blockHeightBeforeChange = (await provider.getBlock('latest'))!.number

    await ethrDid.setAttribute(stringToBytes32('did/svc/TestService1'), 'https://test1.uport.me', 86406)
    let result = await didResolver.resolve(identifier)
    expect(result.didDocumentMetadata.versionId).toEqual(`${blockHeightBeforeChange + 1}`)
    await ethrDid.revokeAttribute(stringToBytes32('did/svc/TestService1'), 'https://test1.uport.me')

    result = await didResolver.resolve(identifier)
    expect(result).toEqual({
      didDocumentMetadata: { versionId: `${blockHeightBeforeChange + 2}`, updated: expect.anything() },
      didResolutionMetadata: expect.anything(),
      didDocument: {
        '@context': expect.anything(),
        id: identifier,
        verificationMethod: [expect.anything()],
        authentication: [expect.anything()],
        assertionMethod: [expect.anything()],
        service: undefined,
      },
    })
  })

  it('removing a service and then adding it back in the next block should keep the service visible in the resolved doc (correct order 2 blocks, corner case)', async () => {
    expect.assertions(2)
    const { shortDID: identifier, signer } = await randomAccount(provider)
    const ethrDid = new EthrDidController(identifier, registryContract, signer)

    const blockHeightBeforeChange = (await provider.getBlock('latest'))!.number

    await ethrDid.revokeAttribute(stringToBytes32('did/svc/TestService1'), 'https://test1.uport.me')
    let result = await didResolver.resolve(identifier)
    expect(result.didDocumentMetadata.versionId).toEqual(`${blockHeightBeforeChange + 1}`)
    await ethrDid.setAttribute(stringToBytes32('did/svc/TestService1'), 'https://test1.uport.me', 86406)

    result = await didResolver.resolve(identifier)
    expect(result).toEqual({
      didDocumentMetadata: { versionId: `${blockHeightBeforeChange + 2}`, updated: expect.anything() },
      didResolutionMetadata: expect.anything(),
      didDocument: {
        '@context': expect.anything(),
        id: identifier,
        verificationMethod: [expect.anything()],
        authentication: [expect.anything()],
        assertionMethod: [expect.anything()],
        service: [
          {
            id: `${identifier}#service-2`,
            type: 'TestService1',
            serviceEndpoint: 'https://test1.uport.me',
          },
        ],
      },
    })
  })
})

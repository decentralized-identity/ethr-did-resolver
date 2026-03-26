import { describe, it, expect, beforeAll, vi } from 'vitest'
import { BrowserProvider, Contract, zeroPadBytes } from 'ethers'
import { Resolver } from 'did-resolver'
import { getResolver, EthrDidResolver } from '../resolver'
import { deployRegistry, randomAccount } from './testUtils'
import { stringToBytes32 } from '../helpers'

describe('error handling', () => {
  const didResolver = new Resolver(
    getResolver({
      networks: [{ name: 'example', rpcUrl: 'example.com' }],
    })
  )

  it('rejects invalid DID', async () => {
    expect.assertions(1)
    await expect(didResolver.resolve('did:ethr:2nQtiQG6Cgm1GYTBaaKAgr76uY7iSexUkqX')).resolves.toEqual({
      didDocument: null,
      didDocumentMetadata: {},
      didResolutionMetadata: {
        error: 'invalidDid',
        message: 'Not a valid did:ethr: 2nQtiQG6Cgm1GYTBaaKAgr76uY7iSexUkqX',
      },
    })
  })

  it('rejects resolution on unconfigured network', async () => {
    expect.assertions(1)
    await expect(
      didResolver.resolve('did:ethr:zrx:0x03fdd57adec3d438ea237fe46b33ee1e016eda6b585c3e27ea66686c2ea5358479')
    ).resolves.toEqual({
      didDocument: null,
      didDocumentMetadata: {},
      didResolutionMetadata: {
        error: 'unknownNetwork',
        message: 'The DID resolver does not have a configuration for network: zrx',
      },
    })
  })

  it('rejects resolution using unsupported `accept` option', async () => {
    expect.assertions(1)
    const accept = 'application/did+cbor'
    await expect(
      didResolver.resolve('did:ethr:example:0x03fdd57adec3d438ea237fe46b33ee1e016eda6b585c3e27ea66686c2ea5358479', {
        accept,
      })
    ).resolves.toEqual({
      didDocument: null,
      didDocumentMetadata: {},
      didResolutionMetadata: {
        error: 'unsupportedFormat',
        message: `The DID resolver does not support the requested 'accept' format: ${accept}`,
      },
    })
  })
})

describe('RPC failure handling', () => {
  let registryResolver: EthrDidResolver
  let provider: BrowserProvider

  beforeAll(async () => {
    const reg = await deployRegistry()
    provider = reg.provider
    const registry = await reg.registryContract.getAddress()
    registryResolver = new EthrDidResolver({ name: 'dev', provider, registry })
  })

  it('returns DIDResolutionResult (not thrown exception) when changeLog fails', async () => {
    expect.assertions(3)
    const { shortDID: did, address } = await randomAccount(provider)
    vi.spyOn(registryResolver, 'changeLog').mockRejectedValueOnce(new Error('missing response'))
    // parsed.id is the part after 'did:ethr:' (the method-specific identifier)
    const parsed = { did, id: `dev:${address}`, method: 'ethr', didUrl: did }
    const result = await registryResolver.resolve(did, parsed as never, null as never, {})
    expect(result.didDocument).toBeNull()
    expect(result.didResolutionMetadata.error).toBe('notFound')
    expect(result.didResolutionMetadata.message).toMatch(/missing response/)
  })

  it('includes RPC hint in message for connectivity errors (non-historical)', async () => {
    expect.assertions(3)
    const { shortDID: did, address } = await randomAccount(provider)
    vi.spyOn(registryResolver, 'changeLog').mockRejectedValueOnce(new Error('missing response'))
    const parsed = { did, id: `dev:${address}`, method: 'ethr', didUrl: did }
    const result = await registryResolver.resolve(did, parsed as never, null as never, {})
    expect(result.didResolutionMetadata.error).toBe('notFound')
    // Connectivity error on a non-historical query: should not mention archive nodes
    expect(result.didResolutionMetadata.message).toMatch(/reachable/)
    expect(result.didResolutionMetadata.message).not.toMatch(/archive/)
  })

  it('instructs user to use an archive node when a known archive error occurs', async () => {
    expect.assertions(2)
    const { shortDID: did, address } = await randomAccount(provider)
    vi.spyOn(registryResolver, 'changeLog').mockRejectedValueOnce(new Error('missing trie node abc (path )'))
    const parsed = { did, id: `dev:${address}`, method: 'ethr', didUrl: did }
    const result = await registryResolver.resolve(did, parsed as never, null as never, {})
    expect(result.didResolutionMetadata.error).toBe('notFound')
    expect(result.didResolutionMetadata.message).toMatch(/archive node/)
  })

  it('instructs user to use an archive node for historical queries that fail with server-side RPC error', async () => {
    expect.assertions(2)
    const { shortDID: did, address } = await randomAccount(provider)
    // A server-side RPC error (missing response) on a versionId (historical) query should suggest archive node
    vi.spyOn(registryResolver, 'getBlockMetadata').mockRejectedValueOnce(new Error('missing response'))
    const parsed = { did, id: `dev:${address}`, method: 'ethr', didUrl: did }
    const result = await registryResolver.resolve(did, parsed as never, null as never, { blockTag: 5 } as never)
    expect(result.didResolutionMetadata.error).toBe('notFound')
    expect(result.didResolutionMetadata.message).toMatch(/archive node/)
  })

  it('does not suggest archive node for timeout errors on historical queries', async () => {
    expect.assertions(3)
    const { shortDID: did, address } = await randomAccount(provider)
    // A timeout on a versionId query means the endpoint is unreachable, not that it lacks archive data
    const timeoutErr = Object.assign(new Error('request timeout'), { code: 'TIMEOUT' })
    vi.spyOn(registryResolver, 'getBlockMetadata').mockRejectedValueOnce(timeoutErr)
    const parsed = { did, id: `dev:${address}`, method: 'ethr', didUrl: did }
    const result = await registryResolver.resolve(did, parsed as never, null as never, { blockTag: 5 } as never)
    expect(result.didResolutionMetadata.error).toBe('notFound')
    expect(result.didResolutionMetadata.message).toMatch(/reachable/)
    expect(result.didResolutionMetadata.message).not.toMatch(/archive/)
  })

  it('returns DIDResolutionResult when getBlockMetadata fails for a historical query', async () => {
    expect.assertions(3)
    const { shortDID: did, address } = await randomAccount(provider)
    vi.spyOn(registryResolver, 'getBlockMetadata').mockRejectedValueOnce(new Error('missing revert data'))
    const parsed = { did, id: `dev:${address}`, method: 'ethr', didUrl: did }
    // blockTag as a number triggers getBlockMetadata before changeLog
    const result = await registryResolver.resolve(did, parsed as never, null as never, { blockTag: 5 } as never)
    expect(result.didDocument).toBeNull()
    expect(result.didResolutionMetadata.error).toBe('notFound')
    expect(result.didResolutionMetadata.message).toMatch(/archive node/)
  })

  it('returns error when previousChange points to a block but getLogs returns no events', async () => {
    expect.assertions(3)
    const { shortDID: did, address, signer } = await randomAccount(provider)
    // Create a real on-chain event so changed(address) is non-zero
    const { address: delegate } = await randomAccount(provider)
    const registry = registryResolver['contracts']['dev'] as Contract
    const connected = registry.connect(signer) as Contract
    await connected['addDelegate'](address, stringToBytes32('veriKey'), delegate, 86400)
    // Spy on provider.getLogs to return empty — simulating a non-archive node
    const realProvider = registry.runner!.provider!
    const getLogsSpy = vi.spyOn(realProvider, 'getLogs').mockResolvedValueOnce([])
    const parsed = { did, id: `dev:${address}`, method: 'ethr', didUrl: did }
    const result = await registryResolver.resolve(did, parsed as never, null as never, {})
    getLogsSpy.mockRestore()
    expect(result.didDocument).toBeNull()
    expect(result.didResolutionMetadata.error).toBe('notFound')
    expect(result.didResolutionMetadata.message).toMatch(/archive node/)
  })
})

describe('non-DID registry events', () => {
  // Invalid UTF-8: continuation bytes (0x80-0xBF) without a lead byte
  const INVALID_UTF8_BYTES = new Uint8Array([0x80, 0x81, 0x82, 0x83])
  const INVALID_UTF8_BYTES32 = zeroPadBytes(INVALID_UTF8_BYTES, 32)

  let registryContract: Contract
  let didResolver: Resolver
  let provider: BrowserProvider

  beforeAll(async () => {
    const reg = await deployRegistry()
    registryContract = reg.registryContract
    didResolver = reg.didResolver
    provider = reg.provider
  })

  it('skips delegate event with non-UTF-8 delegateType, resolution still succeeds', async () => {
    expect.assertions(2)
    const { address: identity, shortDID: did, signer } = await randomAccount(provider)
    const { address: delegate } = await randomAccount(provider)
    // Call registry directly with a bytes32 delegateType that is not valid UTF-8
    const connected = registryContract.connect(signer) as Contract
    await connected['addDelegate'](identity, INVALID_UTF8_BYTES32, delegate, 86400)
    const result = await didResolver.resolve(did)
    // Resolution must succeed — the event is non-DID data and is silently skipped
    expect(result.didResolutionMetadata.error).toBeUndefined()
    // The invalid delegate must NOT appear in the document
    expect(result.didDocument?.verificationMethod).toHaveLength(1) // controller only
  })

  it('skips attribute event with non-UTF-8 name, resolution still succeeds', async () => {
    expect.assertions(2)
    const { address: identity, shortDID: did, signer } = await randomAccount(provider)
    const connected = registryContract.connect(signer) as Contract
    // setAttribute with a bytes32 name that is not valid UTF-8
    await connected['setAttribute'](identity, INVALID_UTF8_BYTES32, '0xdeadbeef', 86400)
    const result = await didResolver.resolve(did)
    expect(result.didResolutionMetadata.error).toBeUndefined()
    expect(result.didDocument?.verificationMethod).toHaveLength(1)
  })

  it('skips pem key when value bytes are not valid UTF-8', async () => {
    expect.assertions(3)
    const { address: identity, shortDID: did, signer } = await randomAccount(provider)
    const connected = registryContract.connect(signer) as Contract
    const pemAttrName = stringToBytes32('did/pub/Secp256k1/veriKey/pem')
    // value is raw bytes that are not valid UTF-8 (a PEM should be ASCII text)
    await connected['setAttribute'](identity, pemAttrName, INVALID_UTF8_BYTES, 86400)
    const result = await didResolver.resolve(did)
    expect(result.didResolutionMetadata.error).toBeUndefined()
    // The malformed pem key must NOT appear in the document
    expect(result.didDocument?.verificationMethod).toHaveLength(1)
    expect(result.didDocument?.assertionMethod).toHaveLength(1)
  })

  it('skips service when value bytes are not valid UTF-8', async () => {
    expect.assertions(3)
    const { address: identity, shortDID: did, signer } = await randomAccount(provider)
    const connected = registryContract.connect(signer) as Contract
    const svcAttrName = stringToBytes32('did/svc/HubService')
    // endpoint value is not valid UTF-8
    await connected['setAttribute'](identity, svcAttrName, INVALID_UTF8_BYTES, 86400)
    const result = await didResolver.resolve(did)
    expect(result.didResolutionMetadata.error).toBeUndefined()
    // The malformed service must NOT appear in the document
    expect(result.didDocument?.service).toBeUndefined()
    expect(result.didDocument?.verificationMethod).toHaveLength(1)
  })

  it('resolves correctly when valid events coexist with non-DID events', async () => {
    expect.assertions(3)
    const { address: identity, shortDID: did, signer } = await randomAccount(provider)
    const { address: validDelegate } = await randomAccount(provider)
    const connected = registryContract.connect(signer) as Contract
    // First: a non-DID delegate event (invalid UTF-8 delegateType)
    await connected['addDelegate'](identity, INVALID_UTF8_BYTES32, validDelegate, 86400)
    // Then: a valid DID delegate event
    await connected['addDelegate'](identity, stringToBytes32('veriKey'), validDelegate, 86400)
    const result = await didResolver.resolve(did)
    expect(result.didResolutionMetadata.error).toBeUndefined()
    // Only the valid delegate appears, plus the controller
    expect(result.didDocument?.verificationMethod).toHaveLength(2)
    expect(result.didDocument?.assertionMethod).toHaveLength(2) // controller + delegate
  })
})

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { BrowserProvider, Contract } from 'ethers'
import { Resolver } from 'did-resolver'
import { deployRegistry, randomAccount, mockFinalizedAsLatest } from './testUtils.js'
import { EthrDidController } from '../controller.js'
import { getResolver } from '../resolver.js'

describe('wrapProvider - resolver integration', () => {
  let provider: BrowserProvider
  let registryContract: Contract

  beforeAll(async () => {
    const result = await deployRegistry()
    provider = result.provider
    registryContract = result.registryContract
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -----------------------------------------------------------------------
  // Test 1: Default store (omit cache) - caching reduces getLogs calls
  // -----------------------------------------------------------------------
  it('default store (omit cache): second resolution makes fewer getLogs calls', async () => {
    // Register a DID with history
    const { address, signer } = await randomAccount(provider)
    const { address: delegate } = await randomAccount(provider)
    await new EthrDidController(address, registryContract, signer).addDelegate('veriKey', delegate, 9999999999)

    const spy = vi.spyOn(provider, 'getLogs')

    // Force finalized = latest so all blocks are cacheable
    mockFinalizedAsLatest(provider)

    const did = `did:ethr:dev:${address}`
    const resolver = new Resolver(getResolver({ name: 'dev', provider, registry: await registryContract.getAddress() }))

    // First resolution - cache miss, provider getLogs called N times
    spy.mockClear()
    await resolver.resolve(did)
    const firstCount = spy.mock.calls.length

    // Second resolution - cache hit, provider getLogs should be called fewer times
    spy.mockClear()
    await resolver.resolve(did)
    const secondCount = spy.mock.calls.length

    expect(firstCount).toBeGreaterThan(0)
    expect(secondCount).toBeLessThan(firstCount)
  })

  // -----------------------------------------------------------------------
  // Test 2: cache: null - no caching, same getLogs count both times
  // -----------------------------------------------------------------------
  it('cache: null: same getLogs count both times (no caching)', async () => {
    // Register a DID with history
    const { address, signer } = await randomAccount(provider)
    const { address: delegate } = await randomAccount(provider)
    await new EthrDidController(address, registryContract, signer).addDelegate('veriKey', delegate, 9999999999)

    const spy = vi.spyOn(provider, 'getLogs')

    const did = `did:ethr:dev:${address}`
    const resolver = new Resolver(
      getResolver({ name: 'dev', provider, registry: await registryContract.getAddress(), cache: null })
    )

    // First resolution
    spy.mockClear()
    await resolver.resolve(did)
    const firstCount = spy.mock.calls.length

    // Second resolution - should be the same (no caching)
    spy.mockClear()
    await resolver.resolve(did)
    const secondCount = spy.mock.calls.length

    expect(firstCount).toBe(secondCount)
  })

  // -----------------------------------------------------------------------
  // Test 3: Explicit shared Map - Map is populated with cache keys
  // -----------------------------------------------------------------------
  it('explicit shared Map: Map contains eth:logs: and eth:block: keys after resolution', async () => {
    // Register a DID with history
    const { address, signer } = await randomAccount(provider)
    const { address: delegate } = await randomAccount(provider)
    await new EthrDidController(address, registryContract, signer).addDelegate('veriKey', delegate, 9999999999)

    const store = new Map<string, string>()

    mockFinalizedAsLatest(provider)

    const did = `did:ethr:dev:${address}`
    const resolver = new Resolver(
      getResolver({
        name: 'dev',
        provider,
        registry: await registryContract.getAddress(),
        cache: store,
      })
    )

    await resolver.resolve(did)

    // Map should be non-empty
    expect(store.size).toBeGreaterThan(0)

    // Should contain at least one eth:logs: key and one eth:block: key
    const hasLogsKey = [...store.keys()].some((k) => k.startsWith('eth:logs:'))
    const hasBlockKey = [...store.keys()].some((k) => k.startsWith('eth:block:'))
    expect(hasLogsKey).toBe(true)
    expect(hasBlockKey).toBe(true)
  })

  // -----------------------------------------------------------------------
  // Test 4: cacheOptions: { fallbackDepth: 0 } accepted and resolution succeeds
  // -----------------------------------------------------------------------
  it('cacheOptions: { fallbackDepth: 0 } is accepted and resolution succeeds', async () => {
    // Register a DID with history
    const { address, signer } = await randomAccount(provider)
    const { address: delegate } = await randomAccount(provider)
    await new EthrDidController(address, registryContract, signer).addDelegate('veriKey', delegate, 9999999999)

    mockFinalizedAsLatest(provider)

    const did = `did:ethr:dev:${address}`
    const resolver = new Resolver(
      getResolver({
        name: 'dev',
        provider,
        registry: await registryContract.getAddress(),
        cache: new Map<string, string>(),
        cacheOptions: { fallbackDepth: 0 },
      })
    )

    const result = await resolver.resolve(did)
    expect(result.didDocument).not.toBeNull()
    expect(result.didDocument!.id).toBe(did)
  })
})

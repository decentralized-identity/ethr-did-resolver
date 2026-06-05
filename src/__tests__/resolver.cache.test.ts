import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { BrowserProvider, Contract } from 'ethers'
import { Resolver } from 'did-resolver'
import { EthrDidController } from '../controller.js'
import { getResolver } from '../resolver.js'
import { InMemoryEthrDidCache } from '../cache.js'
import type { EthrDidCache } from '../cache.js'
import { deployRegistry, randomAccount } from './testUtils.js'

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

let registryContract: Contract
let provider: BrowserProvider
let registryAddress: string
let chainId: number

beforeAll(async () => {
  const result = await deployRegistry()
  registryContract = result.registryContract
  provider = result.provider
  registryAddress = (await registryContract.getAddress()).toLowerCase()
  chainId = Number((await provider.getNetwork()).chainId)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResolver(cache: EthrDidCache) {
  return new Resolver(getResolver({ name: 'dev', provider, registry: registryAddress, cache }))
}

/**
 * Spy on provider.getBlock and treat 'finalized' as 'latest'.
 * This ensures all blocks are considered finalized in the test.
 */
function mockFinalizedAsLatest() {
  const orig = provider.getBlock.bind(provider)
  vi.spyOn(provider, 'getBlock').mockImplementation((blockTag: any, prefetch?: any) => {
    if (blockTag === 'finalized') return orig('latest', prefetch)
    return orig(blockTag, prefetch)
  })
}

// ---------------------------------------------------------------------------
// Phase 5 tests
// ---------------------------------------------------------------------------

describe('resolver cache — changeLog', () => {
  it('5.1 virgin DID: getLogs called zero times, cache stays empty', async () => {
    const cache = new InMemoryEthrDidCache()
    const { shortDID } = await randomAccount(provider)
    const resolver = makeResolver(cache)

    const getLogsSpy = vi.spyOn(provider, 'getLogs')
    await resolver.resolve(shortDID)

    expect(getLogsSpy).not.toHaveBeenCalled()
    // Cache is empty — no block was ever written
    expect(await cache.getBlockMetadata(chainId, 1)).toBeUndefined()
  })

  it('5.2 3 finalized event blocks: getLogs called 3 times, cache has 3 event+metadata entries', async () => {
    const cache = new InMemoryEthrDidCache()
    const { address, shortDID, signer } = await randomAccount(provider)
    const { address: del1 } = await randomAccount(provider)
    const { address: del2 } = await randomAccount(provider)
    const { address: del3 } = await randomAccount(provider)
    const controller = new EthrDidController(address, registryContract, signer)

    // 3 separate on-chain events → 3 separate blocks
    const r1 = await controller.addDelegate('veriKey', del1, 86400)
    const r2 = await controller.addDelegate('veriKey', del2, 86400)
    const r3 = await controller.addDelegate('veriKey', del3, 86400)
    const [blockA, blockB, blockC] = [r1.blockNumber, r2.blockNumber, r3.blockNumber]
    const identity = address.toLowerCase()

    mockFinalizedAsLatest()
    const getLogsSpy = vi.spyOn(provider, 'getLogs')
    const resolver = makeResolver(cache)
    await resolver.resolve(shortDID)

    // getLogs called exactly once per event block
    expect(getLogsSpy).toHaveBeenCalledTimes(3)

    // Cache has event entries for all 3 blocks
    expect(await cache.getEvents(chainId, registryAddress, identity, blockA)).toBeDefined()
    expect(await cache.getEvents(chainId, registryAddress, identity, blockB)).toBeDefined()
    expect(await cache.getEvents(chainId, registryAddress, identity, blockC)).toBeDefined()

    // Cache has metadata for all 3 blocks
    expect(await cache.getBlockMetadata(chainId, blockA)).toBeDefined()
    expect(await cache.getBlockMetadata(chainId, blockB)).toBeDefined()
    expect(await cache.getBlockMetadata(chainId, blockC)).toBeDefined()
  })

  it('5.3 second resolve (all cache hits): getLogs = 0, no finality RPCs', async () => {
    const cache = new InMemoryEthrDidCache()
    const { address, shortDID, signer } = await randomAccount(provider)
    const { address: del1 } = await randomAccount(provider)
    const controller = new EthrDidController(address, registryContract, signer)
    await controller.addDelegate('veriKey', del1, 86400)

    mockFinalizedAsLatest()
    const resolver = makeResolver(cache)
    // First resolve — populates cache
    await resolver.resolve(shortDID)
    vi.restoreAllMocks() // clear the finalized mock

    // Second resolve — all blocks should be cache hits
    const getLogsSpy = vi.spyOn(provider, 'getLogs')
    const getBlockSpy = vi.spyOn(provider, 'getBlock')
    await resolver.resolve(shortDID)

    expect(getLogsSpy).not.toHaveBeenCalled()
    // No finality check needed when there are no cache misses
    const finalizedCalls = getBlockSpy.mock.calls.filter(([tag]) => tag === 'finalized')
    expect(finalizedCalls).toHaveLength(0)
  })

  it('5.4 new event after cache hit: getLogs called exactly once (tip block only)', async () => {
    const cache = new InMemoryEthrDidCache()
    const { address, shortDID, signer } = await randomAccount(provider)
    const { address: del1 } = await randomAccount(provider)
    const { address: del2 } = await randomAccount(provider)
    const controller = new EthrDidController(address, registryContract, signer)
    await controller.addDelegate('veriKey', del1, 86400)

    mockFinalizedAsLatest()
    const resolver = makeResolver(cache)
    // First resolve — caches block A
    await resolver.resolve(shortDID)
    vi.restoreAllMocks()

    // New on-chain event (block B)
    await controller.addDelegate('veriKey', del2, 86400)

    mockFinalizedAsLatest()
    const getLogsSpy = vi.spyOn(provider, 'getLogs')
    // Second resolve — block A from cache, block B from RPC
    await resolver.resolve(shortDID)

    expect(getLogsSpy).toHaveBeenCalledTimes(1)
  })

  it('5.5 pre-populated partial cache: getLogs called once for the uncached tip block', async () => {
    const { address, shortDID, signer } = await randomAccount(provider)
    const { address: del1 } = await randomAccount(provider)
    const { address: del2 } = await randomAccount(provider)
    const { address: del3 } = await randomAccount(provider)
    const controller = new EthrDidController(address, registryContract, signer)
    const r1 = await controller.addDelegate('veriKey', del1, 86400)
    const r2 = await controller.addDelegate('veriKey', del2, 86400)
    const r3 = await controller.addDelegate('veriKey', del3, 86400)
    const [blockA, blockB] = [r1.blockNumber, r2.blockNumber, r3.blockNumber]
    const identity = address.toLowerCase()

    // First resolve to populate a full cache
    mockFinalizedAsLatest()
    const fullCache = new InMemoryEthrDidCache()
    await makeResolver(fullCache).resolve(shortDID)
    vi.restoreAllMocks()

    // Build a partial cache with only blocks A and B (not C)
    const partialCache = new InMemoryEthrDidCache()
    const eventsA = await fullCache.getEvents(chainId, registryAddress, identity, blockA)
    const eventsB = await fullCache.getEvents(chainId, registryAddress, identity, blockB)
    if (eventsA) for (const e of eventsA) await partialCache.setEvent(e)
    if (eventsB) for (const e of eventsB) await partialCache.setEvent(e)

    mockFinalizedAsLatest()
    const getLogsSpy = vi.spyOn(provider, 'getLogs')
    await makeResolver(partialCache).resolve(shortDID)

    // Block C is a cache miss; A and B are hits
    expect(getLogsSpy).toHaveBeenCalledTimes(1)
  })

  it('5.6 block above finalized threshold: getLogs called but setEvent not called', async () => {
    const cache = new InMemoryEthrDidCache()
    const { address, shortDID, signer } = await randomAccount(provider)
    const { address: del } = await randomAccount(provider)
    const controller = new EthrDidController(address, registryContract, signer)
    const receipt = await controller.addDelegate('veriKey', del, 86400)
    const eventBlock = receipt.blockNumber
    const identity = address.toLowerCase()

    // Mock 'finalized' to be one block before the event → event block is NOT finalized
    const orig = provider.getBlock.bind(provider)
    vi.spyOn(provider, 'getBlock').mockImplementation(async (blockTag: any, prefetch?: any) => {
      if (blockTag === 'finalized') return { number: eventBlock - 1 } as any
      return orig(blockTag, prefetch)
    })

    await makeResolver(cache).resolve(shortDID)

    // Event was fetched but NOT cached (block > finalized threshold)
    expect(await cache.getEvents(chainId, registryAddress, identity, eventBlock)).toBeUndefined()
  })

  it('5.6b finalized tag unsupported: falls back to getBlockNumber() - 512, caches events within window', async () => {
    const cache = new InMemoryEthrDidCache()
    const { address, shortDID, signer } = await randomAccount(provider)
    const { address: del } = await randomAccount(provider)
    const controller = new EthrDidController(address, registryContract, signer)
    const receipt = await controller.addDelegate('veriKey', del, 86400)
    const eventBlock = receipt.blockNumber
    const identity = address.toLowerCase()

    // 'finalized' throws → resolver falls back to getBlockNumber() - 512
    // Mock getBlockNumber to return eventBlock + 600, so fallback = eventBlock + 88 > eventBlock → cached
    const origGetBlock = provider.getBlock.bind(provider)
    vi.spyOn(provider, 'getBlock').mockImplementation(async (blockTag: any, prefetch?: any) => {
      if (blockTag === 'finalized') throw new Error('finalized block tag not supported')
      return origGetBlock(blockTag, prefetch)
    })
    vi.spyOn(provider, 'getBlockNumber').mockResolvedValue(eventBlock + 600)

    await makeResolver(cache).resolve(shortDID)

    // eventBlock <= eventBlock + 600 - 512 = eventBlock + 88 → should be cached
    expect(await cache.getEvents(chainId, registryAddress, identity, eventBlock)).toBeDefined()
  })

  it('5.7 virgin DID: neither getBlock("finalized") nor getBlockNumber() called for finality', async () => {
    const cache = new InMemoryEthrDidCache()
    const { shortDID } = await randomAccount(provider)

    const getBlockSpy = vi.spyOn(provider, 'getBlock')
    const getBlockNumberSpy = vi.spyOn(provider, 'getBlockNumber')
    await makeResolver(cache).resolve(shortDID)

    const finalizedCalls = getBlockSpy.mock.calls.filter(([tag]) => tag === 'finalized')
    expect(finalizedCalls).toHaveLength(0)
    expect(getBlockNumberSpy).not.toHaveBeenCalled()
  })

  it('5.8 custom EthrDidCache injected via options: its getEvents/setEvent are called', async () => {
    const { address, shortDID, signer } = await randomAccount(provider)
    const { address: del } = await randomAccount(provider)
    const controller = new EthrDidController(address, registryContract, signer)
    await controller.addDelegate('veriKey', del, 86400)

    const customCache: EthrDidCache = {
      getEvents: vi.fn().mockResolvedValue(undefined), // always miss
      setEvent: vi.fn().mockResolvedValue(undefined),
      getBlockMetadata: vi.fn().mockResolvedValue(undefined),
      setBlockMetadata: vi.fn().mockResolvedValue(undefined),
    }

    mockFinalizedAsLatest()
    await makeResolver(customCache).resolve(shortDID)

    expect(customCache.getEvents).toHaveBeenCalled()
    expect(customCache.setEvent).toHaveBeenCalled()
  })

  it('5.9 getLogs returns empty array: resolve returns notFound', async () => {
    const cache = new InMemoryEthrDidCache()
    const { address, shortDID, signer } = await randomAccount(provider)
    const { address: del } = await randomAccount(provider)
    const controller = new EthrDidController(address, registryContract, signer)
    await controller.addDelegate('veriKey', del, 86400)

    mockFinalizedAsLatest()
    // Mock getLogs to return empty (simulates missing historical data)
    vi.spyOn(provider, 'getLogs').mockResolvedValue([])

    const result = await makeResolver(cache).resolve(shortDID)
    expect(result.didResolutionMetadata.error).toBe('notFound')
  })

  it('5.10 getBlock returns null: resolve returns notFound', async () => {
    const cache = new InMemoryEthrDidCache()
    const { address, shortDID, signer } = await randomAccount(provider)
    const { address: del } = await randomAccount(provider)
    const controller = new EthrDidController(address, registryContract, signer)
    const receipt = await controller.addDelegate('veriKey', del, 86400)
    const eventBlock = receipt.blockNumber

    // Mock getBlock to return null for the event block (but not for 'finalized')
    const orig = provider.getBlock.bind(provider)
    vi.spyOn(provider, 'getBlock').mockImplementation(async (blockTag: any, prefetch?: any) => {
      if (blockTag === eventBlock) return null
      if (blockTag === 'finalized') return orig('latest', prefetch)
      return orig(blockTag, prefetch)
    })

    const result = await makeResolver(cache).resolve(shortDID)
    expect(result.didResolutionMetadata.error).toBe('notFound')
  })
})

// ---------------------------------------------------------------------------
// Phase 6 — getBlockMetadata cache
// ---------------------------------------------------------------------------

describe('resolver cache — getBlockMetadata', () => {
  it('6.1 block metadata populated as side effect of changeLog has correct height and timestamp', async () => {
    const cache = new InMemoryEthrDidCache()
    const { address, shortDID, signer } = await randomAccount(provider)
    const { address: del } = await randomAccount(provider)
    const controller = new EthrDidController(address, registryContract, signer)
    const receipt = await controller.addDelegate('veriKey', del, 86400)
    const eventBlock = receipt.blockNumber

    mockFinalizedAsLatest()
    await makeResolver(cache).resolve(shortDID)

    const meta = await cache.getBlockMetadata(chainId, eventBlock)
    expect(meta).toBeDefined()
    expect(meta!.height).toBe(String(eventBlock))
    // Timestamp must match what's actually on-chain
    const block = await provider.getBlock(eventBlock)
    expect(meta!.timestamp).toBe(block!.timestamp)
  })

  it('6.2 versionId query on an event block: getBlock not called for that block after it is cached', async () => {
    const cache = new InMemoryEthrDidCache()
    const { address, shortDID, signer } = await randomAccount(provider)
    const { address: del } = await randomAccount(provider)
    const controller = new EthrDidController(address, registryContract, signer)
    const receipt = await controller.addDelegate('veriKey', del, 86400)
    const eventBlock = receipt.blockNumber

    // First resolve — populates cache (including block metadata for eventBlock)
    mockFinalizedAsLatest()
    await makeResolver(cache).resolve(shortDID)
    vi.restoreAllMocks()

    // Second resolve with versionId = eventBlock
    // All blocks (including eventBlock) are cache hits — getBlock(eventBlock) must NOT be called
    const getBlockSpy = vi.spyOn(provider, 'getBlock')
    await makeResolver(cache).resolve(`did:ethr:dev:${address}?versionId=${eventBlock}`)

    const callsForEventBlock = getBlockSpy.mock.calls.filter(([tag]) => tag === eventBlock)
    expect(callsForEventBlock).toHaveLength(0)
  })

  it('6.3 versionId query on a non-event block: getBlock called once, result cached', async () => {
    const cache = new InMemoryEthrDidCache()
    const { address, signer } = await randomAccount(provider)
    const { address: del } = await randomAccount(provider)
    const controller = new EthrDidController(address, registryContract, signer)
    const receipt = await controller.addDelegate('veriKey', del, 86400)
    const eventBlock = receipt.blockNumber
    // Use the block just before the event — it exists on-chain but has no DID events
    const queryBlock = eventBlock - 1

    mockFinalizedAsLatest()
    const getBlockSpy = vi.spyOn(provider, 'getBlock')
    await makeResolver(cache).resolve(`did:ethr:dev:${address}?versionId=${queryBlock}`)

    // getBlock(queryBlock) called exactly once (for the now-computation in getBlockMetadata)
    const callsForQueryBlock = getBlockSpy.mock.calls.filter(([tag]) => tag === queryBlock)
    expect(callsForQueryBlock).toHaveLength(1)

    // Result is cached for future calls
    expect(await cache.getBlockMetadata(chainId, queryBlock)).toBeDefined()
  })

  it('6.4 second resolve with same finalized versionId: getBlock called at most once total', async () => {
    const cache = new InMemoryEthrDidCache()
    const { address, signer } = await randomAccount(provider)
    const { address: del } = await randomAccount(provider)
    const controller = new EthrDidController(address, registryContract, signer)
    const receipt = await controller.addDelegate('veriKey', del, 86400)
    const queryBlock = receipt.blockNumber - 1

    mockFinalizedAsLatest()
    // First resolve — fetches and caches queryBlock
    await makeResolver(cache).resolve(`did:ethr:dev:${address}?versionId=${queryBlock}`)
    vi.restoreAllMocks()

    // Second resolve — queryBlock must come from cache
    const getBlockSpy = vi.spyOn(provider, 'getBlock')
    await makeResolver(cache).resolve(`did:ethr:dev:${address}?versionId=${queryBlock}`)

    const callsForQueryBlock = getBlockSpy.mock.calls.filter(([tag]) => tag === queryBlock)
    expect(callsForQueryBlock).toHaveLength(0)
  })

  it('6.5 versionId query walks full history from latest; newer events filtered in wrapDidDocument', async () => {
    const cache = new InMemoryEthrDidCache()
    const { address, signer } = await randomAccount(provider)
    const { address: del1 } = await randomAccount(provider)
    const { address: del2 } = await randomAccount(provider)
    const controller = new EthrDidController(address, registryContract, signer)
    const r1 = await controller.addDelegate('veriKey', del1, 86400) // block B1
    const r2 = await controller.addDelegate('veriKey', del2, 86400) // block B2 > B1
    const [blockB1, blockB2] = [r1.blockNumber, r2.blockNumber]
    const identity = address.toLowerCase()

    mockFinalizedAsLatest()
    const result = await makeResolver(cache).resolve(`did:ethr:dev:${address}?versionId=${blockB1}`)

    // Document at B1 only shows del1 (del2 is at B2 > B1, filtered by wrapDidDocument)
    const vms = result.didDocument?.verificationMethod ?? []
    const delegateIds = vms.filter((vm) => vm.id.includes('delegate')).map((vm) => vm.id)
    expect(delegateIds).toHaveLength(1) // only delegate-1 (del1)

    // But the FULL history was walked — B2 is in the cache
    expect(await cache.getEvents(chainId, registryAddress, identity, blockB2)).toBeDefined()
    // nextVersionId should be B2 (the next event after B1)
    expect(result.didDocumentMetadata.nextVersionId).toBe(String(blockB2))
  })
})

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { Block, BrowserProvider, Contract, Log } from 'ethers'
import { cacheKeys, serializeBlock, deserializeBlock, serializeLogs, deserializeLogs } from '../cachedProvider.js'
import { deployRegistry, randomAccount } from './testUtils.js'
import { EthrDidController } from '../controller.js'

describe('cacheKeys.block', () => {
  it('produces a stable, exact string for given inputs', () => {
    const key = cacheKeys.block(1, 12345)
    expect(key).toBe('eth:block:1:12345')
  })
})

describe('cacheKeys.logs', () => {
  it('lowercases the address and preserves null topics in order', () => {
    const key = cacheKeys.logs(1, {
      address: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
      topics: [null, '0xABC123'],
      fromBlock: 100,
      toBlock: 200,
    })
    expect(key).toBe('eth:logs:1:0xabcdef1234567890abcdef1234567890abcdef12:100:200:[null,"0xabc123"]')
  })

  it('is deterministic: same filter yields identical key twice', () => {
    const filter = {
      address: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
      topics: ['0xAAA', null, '0xBBB'],
      fromBlock: 500,
      toBlock: 600,
    }
    const key1 = cacheKeys.logs(42, filter)
    const key2 = cacheKeys.logs(42, filter)
    expect(key1).toBe(key2)
  })
})

describe('serializeBlock / deserializeBlock', () => {
  it('round-trips { number, timestamp, hash }', () => {
    const original = { number: 42, timestamp: 1625000000, hash: '0xabc123def456' }
    const serialized = serializeBlock(original)
    const deserialized = deserializeBlock(serialized)
    expect(deserialized).toEqual(original)
  })
})

describe('serializeLogs / deserializeLogs', () => {
  it('round-trips 9 scalar fields via deserializeLogs(_, null)', () => {
    const logs = [
      {
        transactionHash: '0xtx1',
        blockHash: '0xbh1',
        blockNumber: 100,
        removed: false,
        address: '0xaddr1',
        data: '0xdata1',
        topics: ['0xtopic1', '0xtopic2'],
        index: 5,
        transactionIndex: 3,
      },
      {
        transactionHash: '0xtx2',
        blockHash: '0xbh2',
        blockNumber: 200,
        removed: true,
        address: '0xaddr2',
        data: '0xdata2',
        topics: [],
        index: 0,
        transactionIndex: 1,
      },
    ]

    const serialized = serializeLogs(logs)
    const deserialized = deserializeLogs(serialized, null as any)

    expect(deserialized).toHaveLength(2)

    const [first, second] = deserialized
    expect(first.transactionHash).toBe('0xtx1')
    expect(first.blockHash).toBe('0xbh1')
    expect(first.blockNumber).toBe(100)
    expect(first.removed).toBe(false)
    expect(first.address).toBe('0xaddr1')
    expect(first.data).toBe('0xdata1')
    expect(first.topics).toEqual(['0xtopic1', '0xtopic2'])
    expect(first.index).toBe(5)
    expect(first.transactionIndex).toBe(3)

    expect(second.transactionHash).toBe('0xtx2')
    expect(second.blockHash).toBe('0xbh2')
    expect(second.blockNumber).toBe(200)
    expect(second.removed).toBe(true)
    expect(second.address).toBe('0xaddr2')
    expect(second.data).toBe('0xdata2')
    expect(second.topics).toEqual([])
    expect(second.index).toBe(0)
    expect(second.transactionIndex).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// createFinalizedTracker
// ---------------------------------------------------------------------------

describe('createFinalizedTracker', () => {
  it('returns the finalized block number when the node supports it', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockProvider: any = {
      getBlock: vi.fn().mockResolvedValue({ number: 42, timestamp: 1234567890, hash: '0xabc' }),
      getBlockNumber: vi.fn().mockResolvedValue(100),
    }

    const { createFinalizedTracker } = await import('../cachedProvider.js')
    const tracker = createFinalizedTracker(mockProvider)
    const finalized = await tracker.getFinalized()

    expect(finalized).toBe(42)
    expect(mockProvider.getBlock).toHaveBeenCalledWith('finalized')
  })

  it("falls back to latest - fallbackDepth when getBlock('finalized') throws", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockProvider: any = {
      getBlock: vi.fn().mockRejectedValue(new Error('finalized block tag not supported')),
      getBlockNumber: vi.fn().mockResolvedValue(1000),
    }

    const { createFinalizedTracker } = await import('../cachedProvider.js')
    const tracker = createFinalizedTracker(mockProvider, { fallbackDepth: 512 })
    const finalized = await tracker.getFinalized()

    expect(finalized).toBe(488)
    expect(mockProvider.getBlock).toHaveBeenCalledWith('finalized')
    expect(mockProvider.getBlockNumber).toHaveBeenCalledWith()
  })

  it('memoizes within TTL: calling getFinalized twice calls getBlock only once', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockProvider: any = {
      getBlock: vi.fn().mockResolvedValue({ number: 77, timestamp: 1234567890, hash: '0xabc' }),
      getBlockNumber: vi.fn().mockResolvedValue(100),
    }

    const { createFinalizedTracker } = await import('../cachedProvider.js')
    const tracker = createFinalizedTracker(mockProvider, { finalizedTtlMs: 15000 })

    await tracker.getFinalized()
    await tracker.getFinalized()

    expect(mockProvider.getBlock).toHaveBeenCalledTimes(1)
  })

  it('refreshes after TTL: advancing time past TTL triggers a second computation', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockProvider: any = {
      getBlock: vi.fn().mockResolvedValue({ number: 99, timestamp: 1234567890, hash: '0xabc' }),
      getBlockNumber: vi.fn().mockResolvedValue(100),
    }

    const { createFinalizedTracker } = await import('../cachedProvider.js')
    const tracker = createFinalizedTracker(mockProvider, { finalizedTtlMs: 100 })

    // First call - should compute
    let finalized = await tracker.getFinalized()
    expect(finalized).toBe(99)
    expect(mockProvider.getBlock).toHaveBeenCalledTimes(1)

    // Advance past TTL using fake timers
    vi.useFakeTimers()
    await vi.advanceTimersByTimeAsync(200)

    // Second call - should recompute
    finalized = await tracker.getFinalized()
    expect(finalized).toBe(99)
    expect(mockProvider.getBlock).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })
})

describe('wrapProvider - getBlock caching', () => {
  let provider: BrowserProvider
  let chainId: number
  let currentBlock: number

  beforeAll(async () => {
    const result = await deployRegistry()
    provider = result.provider
    chainId = Number((await provider.getNetwork()).chainId)
    currentBlock = Number(await provider.getBlockNumber())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('first getBlock(n) is a miss that populates the store', async () => {
    const store = new Map<string, string>()
    const blockNumber = currentBlock

    // Mock finalized to be latest so all blocks are cacheable
    const origGetBlock = provider.getBlock.bind(provider)
    vi.spyOn(provider, 'getBlock').mockImplementation(async (blockTag: any, prefetch?: any) => {
      if (blockTag === 'finalized') return origGetBlock('latest', prefetch)
      return origGetBlock(blockTag, prefetch)
    })

    const { wrapProvider } = await import('../cachedProvider.js')
    const wrapped = wrapProvider(provider, store)
    const block = await wrapped.getBlock(blockNumber)

    expect(block).not.toBeNull()
    const key = cacheKeys.block(chainId, blockNumber)
    expect(store.has(key)).toBe(true)
  })

  it('second getBlock(n) is served from cache: underlying getBlock NOT called again', async () => {
    const store = new Map<string, string>()
    const blockNumber = currentBlock

    // Mock finalized to be latest so all blocks are cacheable
    const origGetBlock = provider.getBlock.bind(provider)
    vi.spyOn(provider, 'getBlock').mockImplementation(async (blockTag: any, prefetch?: any) => {
      if (blockTag === 'finalized') return origGetBlock('latest', prefetch)
      return origGetBlock(blockTag, prefetch)
    })

    // Spy on the raw provider's getBlock to count calls
    const rawGetBlockSpy = vi.spyOn(provider, 'getBlock')

    const { wrapProvider } = await import('../cachedProvider.js')
    const wrapped = wrapProvider(provider, store)

    // First call - cache miss
    const block1 = await wrapped.getBlock(blockNumber)
    expect(block1).not.toBeNull()
    expect(block1!.number).toBe(blockNumber)

    // Second call - cache hit, raw getBlock should NOT be called
    const block2 = await wrapped.getBlock(blockNumber)
    expect(block2).not.toBeNull()
    expect(block2!.number).toBe(blockNumber)
    expect(block2!.timestamp).toBe(block1!.timestamp)

    // getBlock was called exactly once for this numeric block (the miss);
    // the second call was served from cache - no additional call for blockNumber
    // @ts-ignore
    const callsForBlock = rawGetBlockSpy.mock.calls.filter(([tag]: [any]) => tag === blockNumber)
    expect(callsForBlock).toHaveLength(1)
  })

  it('getBlock("latest") and getBlock("finalized") are NEVER written to the store', async () => {
    const store = new Map<string, string>()

    // Mock finalized to be latest so all blocks are cacheable
    const origGetBlock = provider.getBlock.bind(provider)
    vi.spyOn(provider, 'getBlock').mockImplementation(async (blockTag: any, prefetch?: any) => {
      if (blockTag === 'finalized') return origGetBlock('latest', prefetch)
      return origGetBlock(blockTag, prefetch)
    })

    const { wrapProvider } = await import('../cachedProvider.js')
    const wrapped = wrapProvider(provider, store)

    // Call with tag arguments - should pass through uncached
    await wrapped.getBlock('latest')
    await wrapped.getBlock('finalized')

    // Store should be empty - no numeric blocks were fetched
    expect(store.size).toBe(0)
  })

  it('with finalized forced LOW, getBlock(n) is fetched but NOT cached', async () => {
    const store = new Map<string, string>()
    const blockNumber = currentBlock

    // Force finalized to be 0 so blockNumber > finalized → NOT cached
    const origGetBlock = provider.getBlock.bind(provider)
    vi.spyOn(provider, 'getBlock').mockImplementation(async (blockTag: any, prefetch?: any) => {
      if (blockTag === 'finalized') return { number: 0 } as Block
      return origGetBlock(blockTag, prefetch)
    })

    const { wrapProvider } = await import('../cachedProvider.js')
    const wrapped = wrapProvider(provider, store)
    const block = await wrapped.getBlock(blockNumber)

    expect(block).not.toBeNull()
    // Block was fetched from the raw provider
    const key = cacheKeys.block(chainId, blockNumber)
    // But NOT cached because blockNumber > finalized (0)
    expect(store.has(key)).toBe(false)
  })
})

describe('wrapProvider - getLogs caching', () => {
  let provider: BrowserProvider
  let chainId: number
  let registryContract: Contract

  beforeAll(async () => {
    const result = await deployRegistry()
    provider = result.provider
    registryContract = result.registryContract
    chainId = Number((await provider.getNetwork()).chainId)

    // Create DID history so the provider has real logs to work with
    const { address, signer } = await randomAccount(provider)
    const { address: delegate } = await randomAccount(provider)
    await new EthrDidController(address, registryContract, signer).addDelegate('veriKey', delegate, 86400)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('first getLogs for a finalized single-block range populates the store', async () => {
    const store = new Map<string, string>()

    // Force finalized = latest so all blocks are cacheable.
    // Use mockResolvedValue to avoid recursion from origGetBlock calling this.getBlock internally.
    vi.spyOn(provider, 'getBlock').mockResolvedValue({ number: 9999, timestamp: 1234567890, hash: '0xabc123' } as Block)

    const mockLog = {
      transactionHash: '0xtx1',
      blockHash: '0xbh1',
      blockNumber: 10,
      removed: false,
      address: '0xaddr1',
      data: '0xdata1',
      topics: ['0xtopic1'],
      index: 0,
      transactionIndex: 0,
    } as unknown as Log

    const rawGetLogsSpy = vi.spyOn(provider, 'getLogs')
    rawGetLogsSpy.mockResolvedValue([mockLog])

    const { wrapProvider } = await import('../cachedProvider.js')
    const wrapped = wrapProvider(provider, store)

    const filter = { address: '0xaddr1', topics: ['0xtopic1'], fromBlock: 10, toBlock: 10 }
    const logs = await wrapped.getLogs(filter)

    expect(logs).toHaveLength(1)
    expect(logs[0].address).toBe('0xaddr1')

    const key = cacheKeys.logs(chainId, filter)
    expect(store.has(key)).toBe(true)
  })

  it('second identical getLogs is served from cache', async () => {
    const store = new Map<string, string>()

    // Force finalized = latest so all blocks are cacheable
    vi.spyOn(provider, 'getBlock').mockResolvedValue({ number: 9999, timestamp: 1234567890, hash: '0xabc123' } as Block)

    const mockLog = {
      transactionHash: '0xtx2',
      blockHash: '0xbh2',
      blockNumber: 20,
      removed: false,
      address: '0xaddr2',
      data: '0xdata2',
      topics: ['0xtopic2', '0xtopic3'],
      index: 1,
      transactionIndex: 0,
    } as unknown as Log

    const rawGetLogsSpy = vi.spyOn(provider, 'getLogs')
    rawGetLogsSpy.mockResolvedValue([mockLog])

    const { wrapProvider } = await import('../cachedProvider.js')
    const wrapped = wrapProvider(provider, store)

    const filter = { address: '0xaddr2', topics: ['0xtopic2', '0xtopic3'], fromBlock: 20, toBlock: 20 }

    // First call - cache miss
    const logs1 = await wrapped.getLogs(filter)
    expect(logs1).toHaveLength(1)
    expect(logs1[0].address).toBe('0xaddr2')
    expect(store.size).toBe(1) // verify store was populated

    // Second call - cache hit
    const logs2 = await wrapped.getLogs(filter)
    expect(logs2).toHaveLength(1)
    expect(logs2[0].address).toBe('0xaddr2')
    expect(logs2[0].topics).toEqual(['0xtopic2', '0xtopic3'])

    // Underlying getLogs called exactly once (the miss)
    expect(rawGetLogsSpy).toHaveBeenCalledTimes(1)
  })

  it('a range whose toBlock > finalized is fetched but NOT cached', async () => {
    const store = new Map<string, string>()

    // Force finalized to block 5, below the requested range
    vi.spyOn(provider, 'getBlock').mockImplementation(async (blockTag: any) => {
      if (blockTag === 'finalized') return { number: 5 } as Block
      // For numeric block numbers, return a minimal block
      if (typeof blockTag === 'number' || typeof blockTag === 'bigint') {
        return { number: Number(blockTag), timestamp: 1234567890, hash: '0xabc' } as Block
      }
      // For other tags, return a minimal block
      return { number: 9999, timestamp: 1234567890, hash: '0xabc' } as Block
    })

    const mockLog = {
      transactionHash: '0xtx3',
      blockHash: '0xbh3',
      blockNumber: 10,
      removed: false,
      address: '0xaddr3',
      data: '0xdata3',
      topics: [],
      index: 0,
      transactionIndex: 0,
    } as unknown as Log

    const rawGetLogsSpy = vi.spyOn(provider, 'getLogs')
    rawGetLogsSpy.mockResolvedValue([mockLog])

    const { wrapProvider } = await import('../cachedProvider.js')
    const wrapped = wrapProvider(provider, store)

    const filter = { address: '0xaddr3', topics: [], fromBlock: 10, toBlock: 10 }
    const logs = await wrapped.getLogs(filter)

    expect(logs).toHaveLength(1)

    const key = cacheKeys.logs(chainId, filter)
    // Fetched but NOT cached because toBlock(10) > finalized(5)
    expect(store.has(key)).toBe(false)
  })

  it('a filter with a tag bound is passed through and NOT cached', async () => {
    const store = new Map<string, string>()

    vi.spyOn(provider, 'getLogs').mockResolvedValue([])

    const { wrapProvider } = await import('../cachedProvider.js')
    const wrapped = wrapProvider(provider, store)

    const filter = { address: '0xaddr4', topics: ['0xtopic4'], fromBlock: 100, toBlock: 'latest' }
    const logs = await wrapped.getLogs(filter)

    // Should return an array (actual chain logs or empty)
    expect(Array.isArray(logs)).toBe(true)

    // Store should be empty - tag-bound filters are never cached
    expect(store.size).toBe(0)
  })
})

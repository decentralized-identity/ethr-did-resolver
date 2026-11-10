import { describe, it, expect, vi, beforeEach } from 'vitest'
import { type LogParams, type Provider } from 'ethers'
import { isArbitrumFamily, mapL1PointerToL2Range } from '../arbitrumFallback.js'
import { logDecoder } from '../logParser.js'
import { EthrDidResolver } from '../resolver.js'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const REGISTRY = '0xa8d4a9222e40D3049297F88494f8F06A654F9c5d'
const IDENTITY = '0xd3401C1030aB8800CB89f2694F66f0D0f4853DfC'
const OWNER_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const OWNER_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const OWNER_C = '0xcccccccccccccccccccccccccccccccccccccccc'
const TX_HASH = '0xdeadbeef00000000000000000000000000000000000000000000000000000000'

function makeArgs(fields: { name: string; val: unknown }[]): unknown[] & Record<string, unknown> {
  const arr: unknown[] & Record<string, unknown> = fields.map((f) => f.val) as never
  for (const f of fields) arr[f.name] = f.val
  return arr
}

function makeOwnerChangedDesc(identity: string, owner: string, previousChange: bigint) {
  return {
    name: 'DIDOwnerChanged',
    args: makeArgs([
      { name: 'identity', val: identity },
      { name: 'owner', val: owner },
      { name: 'previousChange', val: previousChange },
    ]),
  }
}

function makeLog(blockNumber: number, index: number): LogParams {
  return {
    blockNumber,
    index,
    transactionHash: TX_HASH,
    topics: ['0x0', `0x000000000000000000000000${IDENTITY.slice(2).toLowerCase()}`],
    data: '0x',
    address: REGISTRY,
  } as unknown as LogParams
}

/**
 * Mock provider simulating an Arbitrum-family chain where every 4 local
 * blocks share one L1 estimate: `l1BlockNumber = floor(localBlock / 4)`.
 * `changed()` pointers are therefore L1-scale while `eth_getLogs` indexes
 * local blocks - the exact mismatch from
 * https://github.com/decentralized-identity/ethr-did-resolver/issues/328
 */
function makeArbitrumProvider(opts: { logsByRange: Record<string, LogParams[]>; arbSys: boolean }) {
  const l1Of = (local: number) => Math.floor(local / 4)
  return {
    getBlockNumber: vi.fn().mockResolvedValue(999),
    getNetwork: vi.fn().mockResolvedValue({ chainId: 421614n, name: 'arbitrum-sepolia' }),
    call: vi.fn().mockImplementation(async (tx: { to?: string }) => {
      if (tx.to?.toLowerCase() === '0x0000000000000000000000000000000000000064') {
        // ArbSys.arbBlockNumber()
        return opts.arbSys ? `0x${'0'.repeat(62)}01` : '0x'
      }
      throw new Error(`unexpected call to ${tx.to}`)
    }),
    send: vi.fn().mockImplementation(async (method: string, params: unknown[]) => {
      if (method !== 'eth_getBlockByNumber') throw new Error(`unexpected send ${method}`)
      const n = parseInt(params[0] as string, 16)
      if (n > 999) return null
      return {
        number: params[0],
        timestamp: `0x${(1700000000 + n).toString(16)}`,
        l1BlockNumber: `0x${l1Of(n).toString(16)}`,
      }
    }),
    getLogs: vi.fn().mockImplementation(async (filter: { fromBlock: number; toBlock: number }) => {
      return opts.logsByRange[`${filter.fromBlock}-${filter.toBlock}`] ?? []
    }),
    getBlock: vi.fn().mockResolvedValue(null),
  }
}

function mockContract(provider: unknown, parseLogImpl: (log: unknown) => unknown) {
  return {
    changed: vi.fn(),
    getAddress: vi.fn().mockResolvedValue(REGISTRY),
    runner: { provider },
    interface: { parseLog: vi.fn().mockImplementation(parseLogImpl) },
  }
}

function makeResolverWithMockContract(networkId: string, contract: unknown, provider: unknown) {
  // The constructor requires at least one configured network; the placeholder
  // contract it builds is replaced by the full mock below.
  const resolver = new EthrDidResolver({
    networks: [{ name: 'placeholder', chainId: 1, provider: provider as never, registry: REGISTRY }],
    cache: null,
  })
  ;(resolver as unknown as { contracts: Record<string, unknown> }).contracts[networkId] = contract
  return resolver
}

// ---------------------------------------------------------------------------
// isArbitrumFamily
// ---------------------------------------------------------------------------

describe('isArbitrumFamily', () => {
  it('returns true when the ArbSys precompile answers', async () => {
    const provider = makeArbitrumProvider({ logsByRange: {}, arbSys: true })
    expect(await isArbitrumFamily(provider as unknown as Provider)).toBe(true)
  })

  it('returns false when the precompile address has no code', async () => {
    const provider = makeArbitrumProvider({ logsByRange: {}, arbSys: false })
    expect(await isArbitrumFamily(provider as unknown as Provider)).toBe(false)
  })

  it('returns false when the call throws', async () => {
    const provider = { call: vi.fn().mockRejectedValue(new Error('nope')) }
    expect(await isArbitrumFamily(provider as unknown as Provider)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// mapL1PointerToL2Range
// ---------------------------------------------------------------------------

describe('mapL1PointerToL2Range', () => {
  it('maps an L1 pointer shared by several local blocks to the full bucket', async () => {
    const provider = makeArbitrumProvider({ logsByRange: {}, arbSys: true })
    // l1 = floor(local / 4): pointer 100 <-> local blocks 400..403
    const range = await mapL1PointerToL2Range(provider as unknown as Provider, 100)
    expect(range).not.toBeNull()
    expect(range!.fromBlock).toBe(400)
    expect(range!.toBlock).toBe(403)
    expect(range!.timestamps.get(400)).toBe(1700000400)
    expect(range!.timestamps.get(403)).toBe(1700000403)
  })

  it('returns null for a pointer beyond the latest L1 estimate', async () => {
    const provider = makeArbitrumProvider({ logsByRange: {}, arbSys: true })
    // latest local block 999 -> l1 249; pointer 250 has no bucket
    expect(await mapL1PointerToL2Range(provider as unknown as Provider, 250)).toBeNull()
  })

  it('returns null for non-positive pointers', async () => {
    const provider = makeArbitrumProvider({ logsByRange: {}, arbSys: true })
    expect(await mapL1PointerToL2Range(provider as unknown as Provider, 0)).toBeNull()
    expect(await mapL1PointerToL2Range(provider as unknown as Provider, -5)).toBeNull()
  })

  it('honours maxBlock to narrow the search for strictly older buckets', async () => {
    const provider = makeArbitrumProvider({ logsByRange: {}, arbSys: true })
    const range = await mapL1PointerToL2Range(provider as unknown as Provider, 50, 250)
    expect(range).not.toBeNull()
    expect(range!.fromBlock).toBe(200)
    expect(range!.toBlock).toBe(203)
  })
})

// ---------------------------------------------------------------------------
// logDecoder pointer bound (the trap from the issue discussion)
// ---------------------------------------------------------------------------

describe('logDecoder arbitrum pointer bound', () => {
  it('sorts multi-block logs by (blockNumber, logIndex), not logIndex alone', () => {
    const contract = {
      interface: { parseLog: vi.fn().mockReturnValue(makeOwnerChangedDesc(IDENTITY, OWNER_A, 0n)) },
    } as unknown as import('ethers').Contract
    const { events } = logDecoder(
      contract,
      [makeLog(1001, 0), makeLog(1000, 7)],
      1001,
      1700000000,
      421614,
      REGISTRY
    )
    expect(events.map((e) => [e.blockNumber, e.logIndex])).toEqual([
      [1000, 7],
      [1001, 0],
    ])
  })

  it('with an L1 pointer bound, excludes the bucket pointer itself as predecessor', () => {
    // Two L2 blocks share pointer P=100 (the norm on Arbitrum: consecutive
    // writes in one L1 window reuse the pointer). Block 1001 rotates B->C with
    // previousChange=100, i.e. it points at its own bucket.
    const parseLog = vi.fn()
    parseLog
      .mockReturnValueOnce(makeOwnerChangedDesc(IDENTITY, OWNER_B, 90n)) // block 1000
      .mockReturnValueOnce(makeOwnerChangedDesc(IDENTITY, OWNER_C, 100n)) // block 1001, pc == P
    const contract = { interface: { parseLog } } as unknown as import('ethers').Contract

    const { events, previousChange } = logDecoder(
      contract,
      [makeLog(1000, 7), makeLog(1001, 0)],
      1001,
      1700000000,
      421614,
      REGISTRY,
      100 // pointerBound: the L1 estimate, not the local height
    )
    expect(events).toHaveLength(2)
    // The walk continues to the strictly older pointer 90, never revisits 100.
    expect(previousChange).toBe(90)
  })

  it('demonstrates the trap: a local-height bound would accept the bucket pointer', () => {
    const parseLog = vi.fn().mockReturnValue(makeOwnerChangedDesc(IDENTITY, OWNER_C, 100n))
    const contract = { interface: { parseLog } } as unknown as import('ethers').Contract
    // Default bound (blockNumber = local height 1001): 100 < 1001 passes.
    const { previousChange } = logDecoder(contract, [makeLog(1001, 0)], 1001, 1700000000, 421614, REGISTRY)
    expect(previousChange).toBe(100)
  })
})

// ---------------------------------------------------------------------------
// End-to-end changeLog on a simulated Arbitrum chain (issue #328)
// ---------------------------------------------------------------------------

describe('changeLog arbitrum L1-pointer fallback (issue #328)', () => {
  let provider: ReturnType<typeof makeArbitrumProvider>
  let resolver: EthrDidResolver

  beforeEach(() => {
    // changed() = 100 (L1 scale). Bucket 100 = local blocks 400..403:
    //   block 400 rotates A->B (previousChange 90)
    //   block 401 rotates B->C (previousChange 100, reuses the bucket pointer)
    // Bucket 90 = local blocks 360..363: block 360 initial write (previousChange 0).
    provider = makeArbitrumProvider({
      arbSys: true,
      logsByRange: {
        '100-100': [],
        '400-403': [makeLog(400, 7), makeLog(401, 0)],
        '90-90': [],
        '360-363': [makeLog(360, 2)],
      },
    })
    const parseLog = vi.fn()
    parseLog
      .mockReturnValueOnce(makeOwnerChangedDesc(IDENTITY, OWNER_B, 90n)) // block 400
      .mockReturnValueOnce(makeOwnerChangedDesc(IDENTITY, OWNER_C, 100n)) // block 401
      .mockReturnValueOnce(makeOwnerChangedDesc(IDENTITY, OWNER_A, 0n)) // block 360
    const contract = mockContract(provider, (log) => parseLog(log))
    contract.changed.mockResolvedValue(100n)
    resolver = makeResolverWithMockContract('arbsep', contract, provider)
  })

  it('walks L1-scale pointers through their local buckets and terminates', async () => {
    const { address, history } = await resolver.changeLog(IDENTITY, 'arbsep')

    expect(address.toLowerCase()).toBe(IDENTITY.toLowerCase())
    // Oldest first: initial write, then the two rotations in (block, logIndex) order.
    expect(history.map((e) => [e.blockNumber, e.logIndex])).toEqual([
      [360, 2],
      [400, 7],
      [401, 0],
    ])
    // Each block stamped with its own timestamp.
    expect(history[0].blockTimestamp).toBe(1700000360)
    expect(history[1].blockTimestamp).toBe(1700000400)
    // The shared bucket pointer (100) is stored on the event but never
    // followed as a predecessor: the walk went 100 -> 90 -> 0 and stopped.
    expect(history.map((e) => e.previousChange)).toEqual([0, 90, 100])
  })

  it('still throws the original error on non-Arbitrum chains', async () => {
    const ethProvider = makeArbitrumProvider({ arbSys: false, logsByRange: { '100-100': [] } })
    const contract = mockContract(ethProvider, () => makeOwnerChangedDesc(IDENTITY, OWNER_A, 0n))
    contract.changed.mockResolvedValue(100n)
    const ethResolver = makeResolverWithMockContract('mainnet', contract, ethProvider)
    await expect(ethResolver.changeLog(IDENTITY, 'mainnet')).rejects.toThrow(
      'No logs found for block 100 but previousChange points here.'
    )
  })
})

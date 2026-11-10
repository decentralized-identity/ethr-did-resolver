import { id, type Provider } from 'ethers'

/**
 * Helpers for resolving `did:ethr` on Arbitrum-family chains (Arbitrum One,
 * Nova, Sepolia and Orbit L3s).
 *
 * On these chains Solidity `block.number` returns an estimate of the
 * *parent-chain* block number, not the local block height
 * (https://docs.arbitrum.io/build-decentralized-apps/arbitrum-vs-ethereum/block-numbers-and-time).
 * `EthereumDIDRegistry` stores that estimate in `changed[identity]` and in each
 * event's `previousChange`, but `eth_getLogs` indexes *local* blocks - so a
 * `changed()` pointer used as `fromBlock`/`toBlock` finds no logs and the
 * resolver fails. The local block headers carry the same estimate in their
 * `l1BlockNumber` field, which lets us map a pointer back to the contiguous
 * range of local blocks it was written in.
 */

/** The ArbSys precompile, present on every Arbitrum-family chain. */
export const ARB_SYS_ADDRESS = '0x0000000000000000000000000000000000000064'

/** Selector of `ArbSys.arbBlockNumber()`, which returns the local block number. */
const ARB_BLOCK_NUMBER_SELECTOR = id('arbBlockNumber()').slice(0, 10)

/**
 * Returns true when the provider talks to an Arbitrum-family chain. Calls the
 * ArbSys precompile: on other chains the address has no code and the call
 * returns empty data.
 */
export async function isArbitrumFamily(provider: Provider): Promise<boolean> {
  try {
    const result = await provider.call({ to: ARB_SYS_ADDRESS, data: ARB_BLOCK_NUMBER_SELECTOR })
    return !!result && result !== '0x'
  } catch {
    return false
  }
}

export interface L1PointerBucket {
  /** First local block whose header `l1BlockNumber` equals the pointer. */
  fromBlock: number
  /** Last local block whose header `l1BlockNumber` equals the pointer. */
  toBlock: number
  /** Local block number -> block timestamp, for every block in `[fromBlock, toBlock]`. */
  timestamps: Map<number, number>
}

interface HeaderInfo {
  l1BlockNumber: number
  timestamp: number
}

async function readHeader(provider: Provider, blockNumber: number): Promise<HeaderInfo | null> {
  // `l1BlockNumber` is an Arbitrum-specific header field, so read the raw RPC
  // response instead of the parsed ethers Block (which drops unknown fields).
  const sender = provider as unknown as { send?: (method: string, params: unknown[]) => Promise<unknown> }
  if (typeof sender.send !== 'function') return null
  let raw: { l1BlockNumber?: unknown; timestamp?: unknown } | null
  try {
    raw = (await sender.send('eth_getBlockByNumber', [`0x${blockNumber.toString(16)}`, false])) as {
      l1BlockNumber?: unknown
      timestamp?: unknown
    } | null
  } catch {
    return null
  }
  if (!raw || raw.l1BlockNumber == null || raw.timestamp == null) return null
  const l1BlockNumber = Number(BigInt(raw.l1BlockNumber as string))
  const timestamp = Number(BigInt(raw.timestamp as string))
  if (!Number.isSafeInteger(l1BlockNumber) || !Number.isSafeInteger(timestamp)) return null
  return { l1BlockNumber, timestamp }
}

/**
 * Maps a registry `changed()` pointer (an L1 block estimate on Arbitrum-family
 * chains) to the contiguous range of local blocks whose header `l1BlockNumber`
 * equals it. Returns null when no local block maps to the pointer.
 *
 * `l1BlockNumber` is non-decreasing in local block height, so the bucket is
 * located with a binary search for the first local block with
 * `l1BlockNumber >= pointer`, followed by a forward scan while it stays equal.
 * `maxBlock` optionally caps the search: history pointers strictly decrease
 * while walking, so each later bucket lies entirely below the previous one.
 */
export async function mapL1PointerToL2Range(
  provider: Provider,
  l1Pointer: number,
  maxBlock?: number
): Promise<L1PointerBucket | null> {
  if (!Number.isSafeInteger(l1Pointer) || l1Pointer <= 0) return null
  let hi = maxBlock ?? (await provider.getBlockNumber())
  if (!Number.isSafeInteger(hi) || hi < 0) return null
  const hiHeader = await readHeader(provider, hi)
  if (!hiHeader || hiHeader.l1BlockNumber < l1Pointer) return null

  // Binary search: first local block with l1BlockNumber >= l1Pointer.
  let lo = 0
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    const header = await readHeader(provider, mid)
    if (!header) return null
    if (header.l1BlockNumber < l1Pointer) lo = mid + 1
    else hi = mid
  }
  const first = await readHeader(provider, lo)
  if (!first || first.l1BlockNumber !== l1Pointer) return null

  const timestamps = new Map<number, number>([[lo, first.timestamp]])
  let toBlock = lo
  // Forward scan while l1BlockNumber stays equal (batched to limit round trips).
  const BATCH = 32
  outer: for (;;) {
    const batchStart = toBlock + 1
    const headers = await Promise.all(Array.from({ length: BATCH }, (_, i) => readHeader(provider, batchStart + i)))
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i]
      if (!header || header.l1BlockNumber !== l1Pointer) break outer
      toBlock = batchStart + i
      timestamps.set(toBlock, header.timestamp)
    }
  }
  return { fromBlock: lo, toBlock, timestamps }
}

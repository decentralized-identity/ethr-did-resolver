import { AddressLike, Filter, Log, type LogParams, TopicFilter } from 'ethers'

/**
 * NARROW block projection returned by the cached provider on a cache hit.
 *
 * IMPORTANT: This wrapper is NOT a general-purpose Provider replacement. A
 * block served from the cache exposes ONLY { number, timestamp, hash }. Every other
 * field of a normal ethers Block is ABSENT. This is intentional and sufficient
 * because ethr-did-resolver only ever reads `number` and `timestamp` from a
 * block. Do not rely on this wrapper for anything beyond ethr-did-resolver.
 */
export interface CachedBlock {
  number: number
  timestamp: number
  hash: string
}

export interface KVStore {
  get(key: string): string | undefined | Promise<string | undefined>
  set(key: string, value: string): KVStore | Promise<KVStore>
}

export interface WrapProviderOptions {
  finalizedTtlMs?: number
  fallbackDepth?: number
}

export function serializeBlock(block: { number: number; timestamp: number; hash: string }): string {
  return JSON.stringify({ number: block.number, timestamp: block.timestamp, hash: block.hash })
}

export function deserializeBlock(str: string): CachedBlock {
  return JSON.parse(str) as CachedBlock
}

const LOG_FIELDS = [
  'transactionHash',
  'blockHash',
  'blockNumber',
  'removed',
  'address',
  'data',
  'topics',
  'index',
  'transactionIndex',
] as const

export function serializeLogs(logs: unknown[]): string {
  return JSON.stringify(
    logs.map((log) => {
      const entry: Record<string, unknown> = {}
      for (const field of LOG_FIELDS) {
        entry[field] = (log as Record<string, unknown>)[field]
      }
      return entry
    })
  )
}

export function deserializeLogs(str: string, provider: Provider): Log[] {
  const entries = JSON.parse(str) as LogParams[]
  // The ethers Log constructor expects `Provider | null` but we receive `unknown`.
  // There is no safe narrow path since `LogParams` does not expose the provider type.
  return entries.map((entry) => new Log(entry, provider))
}

/**
 * NARROW block projection returned by the cached provider on a cache hit.
 *
 * IMPORTANT: This wrapper is NOT a general-purpose Provider replacement. A
 * block served from the cache exposes ONLY { number, timestamp, hash }. Every other
 * field of a normal ethers Block is ABSENT. This is intentional and sufficient
 * because ethr-did-resolver only ever reads `number` and `timestamp` from a
 * block. Do not rely on this wrapper for anything beyond ethr-did-resolver.
 */

import type { Provider } from 'ethers'

export function createFinalizedTracker(
  provider: Provider,
  options?: WrapProviderOptions
): { getFinalized(): Promise<number> } {
  const finalizedTtlMs = options?.finalizedTtlMs ?? 15000
  const fallbackDepth = options?.fallbackDepth ?? 512

  let cachedValue: number | undefined
  let lastComputedAt: number | undefined
  let inFlight: Promise<number> | null = null

  async function compute(): Promise<number> {
    try {
      const block = await provider.getBlock('finalized')
      if (block && typeof block.number === 'number') {
        cachedValue = block.number
        lastComputedAt = Date.now()
        return cachedValue
      }
    } catch {
      // fall through to fallback
    }
    const latest = await provider.getBlockNumber()
    cachedValue = Math.max(0, Number(latest) - fallbackDepth)
    lastComputedAt = Date.now()
    return cachedValue
  }

  return {
    async getFinalized() {
      const now = Date.now()
      if (cachedValue !== undefined && lastComputedAt !== undefined && now - lastComputedAt < finalizedTtlMs) {
        return cachedValue
      }
      if (inFlight) {
        return inFlight
      }
      inFlight = compute().finally(() => {
        inFlight = null
      })
      return inFlight
    },
  }
}

export const cacheKeys = {
  block(chainId: number, blockNumber: number): string {
    return `eth:block:${chainId}:${blockNumber}`
  },
  logs(
    chainId: number,
    filter: { address: AddressLike | Array<AddressLike>; topics: TopicFilter; fromBlock: number; toBlock: number }
  ): string {
    const topicsJson = JSON.stringify(
      filter.topics.map((t) =>
        t === null ? null : Array.isArray(t) ? t.map((tt) => tt.toLowerCase()) : t.toLowerCase()
      )
    )
    const addressLike: AddressLike = Array.isArray(filter.address)
      ? filter.address.join(',')
      : (filter.address as string)
    return `eth:logs:${chainId}:${addressLike.toLowerCase()}:${filter.fromBlock}:${filter.toBlock}:${topicsJson}`
  },
}

/**
 * Wraps a provider to cache getBlock(number) results in a KVStore.
 *
 * IMPORTANT: This wrapper is NOT a general-purpose Provider replacement. A
 * block served from the cache exposes ONLY { number, timestamp, hash }. Every other
 * field of a normal ethers Block is ABSENT. This is intentional and sufficient
 * because ethr-did-resolver only ever reads `number` and `timestamp` from a
 * block. Do not rely on this wrapper for anything beyond ethr-did-resolver.
 */
export function wrapProvider(provider: Provider, store: KVStore, options?: WrapProviderOptions): Provider {
  const tracker = createFinalizedTracker(provider, options)
  let chainIdPromise: Promise<number> | undefined

  async function getChainId(): Promise<number> {
    if (!chainIdPromise) {
      chainIdPromise = (async () => {
        const network = await provider.getNetwork()
        return Number(network.chainId)
      })()
    }
    return chainIdPromise
  }

  function createWrapped(): Provider {
    // The Proxy handler accesses properties dynamically via `prop` (string | symbol).
    // For properties not explicitly handled (getBlock, getLogs, provider), we fall back
    // to the original provider member using `as keyof Provider` for type safety.
    const proxy: Provider = new Proxy(provider, {
      get(target: Provider, prop) {
        if (prop === 'provider') {
          // Return the wrapped provider itself so that contract.runner.provider
          // returns the Proxy-wrapped provider rather than the original provider.
          // Without this, Provider.provider returns `this` (the target),
          // causing the resolver to bypass the cache entirely.
          return proxy
        }

        if (prop === 'getBlock') {
          return async (blockTag: number | bigint | string) => {
            // Non-numeric: pass through to raw provider, never cache
            if (typeof blockTag !== 'number' && typeof blockTag !== 'bigint') {
              return target.getBlock(blockTag)
            }

            const n = Number(blockTag)
            const cid = await getChainId()
            const key = cacheKeys.block(cid, n)

            const hit = await store.get(key)
            if (hit !== undefined) {
              return deserializeBlock(hit)
            }

            const block = await target.getBlock(n)
            if (block === null) return null

            const finalized = await tracker.getFinalized()
            if (n <= finalized) {
              await store.set(
                key,
                serializeBlock({
                  number: block.number,
                  timestamp: block.timestamp,
                  hash: block.hash!,
                })
              )
            }

            return block
          }
        }

        if (prop === 'getLogs') {
          return async (filter: Filter) => {
            // Only cache when both fromBlock and toBlock are numeric
            if (typeof filter?.fromBlock !== 'number' && typeof filter?.fromBlock !== 'bigint') {
              return target.getLogs(filter)
            }
            if (typeof filter?.toBlock !== 'number' && typeof filter?.toBlock !== 'bigint') {
              return target.getLogs(filter)
            }

            const cid = await getChainId()
            const key = cacheKeys.logs(cid, {
              address: filter.address!,
              topics: filter.topics!,
              fromBlock: Number(filter.fromBlock),
              toBlock: Number(filter.toBlock),
            })

            const hit = await store.get(key)
            if (hit !== undefined) {
              return deserializeLogs(hit, provider)
            }

            const logs = await target.getLogs(filter)

            const finalized = await tracker.getFinalized()
            if (Number(filter.toBlock) <= finalized) {
              await store.set(key, serializeLogs(logs))
            }

            return logs
          }
        }

        const member = target[prop as keyof Provider]
        return typeof member === 'function' ? member.bind(target) : member
      },
    })
    return proxy
  }

  return createWrapped()
}

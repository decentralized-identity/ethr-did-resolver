import { describe, it, expect } from 'vitest'
import { InMemoryEthrDidCache } from '../cache.js'
import type { BlockMetadataEntry } from '../cache.js'
import type { CanonicalDIDEvent } from '../helpers.js'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const CHAIN_ID = 1
const REGISTRY = '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b'
const IDENTITY = '0xf3beac30c498d9e26865f34fcaa57dbb935b0d74'
const BLOCK = 5

function makeOwnerEvent(logIndex = 0, previousChange = 0): CanonicalDIDEvent {
  return {
    eventType: 'DIDOwnerChanged',
    chainId: CHAIN_ID,
    registryAddress: REGISTRY,
    identity: IDENTITY,
    blockNumber: BLOCK,
    blockTimestamp: 1700000000,
    logIndex,
    transactionHash: '0xabc',
    previousChange,
    owner: IDENTITY,
  }
}

const META: BlockMetadataEntry = { height: '5', timestamp: 1700000000 }

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InMemoryEthrDidCache', () => {
  it('2.1 getEvents returns undefined on an empty cache', async () => {
    const cache = new InMemoryEthrDidCache()
    expect(await cache.getEvents(CHAIN_ID, REGISTRY, IDENTITY, BLOCK)).toBeUndefined()
  })

  it('2.2 getEvents returns the event after setEvent', async () => {
    const cache = new InMemoryEthrDidCache()
    const event = makeOwnerEvent()
    await cache.setEvent(event)
    expect(await cache.getEvents(CHAIN_ID, REGISTRY, IDENTITY, BLOCK)).toEqual([event])
  })

  it('2.3 getEvents returns undefined for a different chainId', async () => {
    const cache = new InMemoryEthrDidCache()
    await cache.setEvent(makeOwnerEvent())
    expect(await cache.getEvents(999, REGISTRY, IDENTITY, BLOCK)).toBeUndefined()
  })

  it('2.4 getEvents returns undefined for a different registryAddress', async () => {
    const cache = new InMemoryEthrDidCache()
    await cache.setEvent(makeOwnerEvent())
    const other = '0x1111111111111111111111111111111111111111'
    expect(await cache.getEvents(CHAIN_ID, other, IDENTITY, BLOCK)).toBeUndefined()
  })

  it('2.5 getEvents returns undefined for a different identity', async () => {
    const cache = new InMemoryEthrDidCache()
    await cache.setEvent(makeOwnerEvent())
    const other = '0x2222222222222222222222222222222222222222'
    expect(await cache.getEvents(CHAIN_ID, REGISTRY, other, BLOCK)).toBeUndefined()
  })

  it('2.6 getEvents returns undefined for a different blockNumber', async () => {
    const cache = new InMemoryEthrDidCache()
    await cache.setEvent(makeOwnerEvent())
    expect(await cache.getEvents(CHAIN_ID, REGISTRY, IDENTITY, BLOCK + 1)).toBeUndefined()
  })

  it('2.7 getBlockMetadata returns undefined on an empty cache', async () => {
    const cache = new InMemoryEthrDidCache()
    expect(await cache.getBlockMetadata(CHAIN_ID, BLOCK)).toBeUndefined()
  })

  it('2.8 getBlockMetadata returns entry after setBlockMetadata', async () => {
    const cache = new InMemoryEthrDidCache()
    await cache.setBlockMetadata(CHAIN_ID, BLOCK, META)
    expect(await cache.getBlockMetadata(CHAIN_ID, BLOCK)).toEqual(META)
  })

  it('2.9 event and metadata stores do not cross-contaminate on identical key strings', async () => {
    const cache = new InMemoryEthrDidCache()
    await cache.setEvent(makeOwnerEvent())
    // Metadata key "1:5" — same chainId and blockNumber as the event entry
    expect(await cache.getBlockMetadata(CHAIN_ID, BLOCK)).toBeUndefined()
  })

  it('2.10 setEvent normalises mixed-case addresses; getEvents with lowercase key succeeds', async () => {
    const cache = new InMemoryEthrDidCache()
    const mixedEvent: CanonicalDIDEvent = {
      ...makeOwnerEvent(),
      registryAddress: '0xDCA7EF03E98E0DC2B855BE647C39ABE984FCF21B',
      identity: '0xF3BEAC30C498D9E26865F34FCAA57DBB935B0D74',
    }
    await cache.setEvent(mixedEvent)
    expect(await cache.getEvents(CHAIN_ID, REGISTRY, IDENTITY, BLOCK)).toBeDefined()
  })

  it('2.11 getEvents returns events sorted by logIndex ASC even when stored out of order', async () => {
    const cache = new InMemoryEthrDidCache()
    const e2 = makeOwnerEvent(2)
    const e0 = makeOwnerEvent(0)
    const e1 = makeOwnerEvent(1)
    // Store deliberately out of order
    await cache.setEvent(e2)
    await cache.setEvent(e0)
    await cache.setEvent(e1)
    const result = await cache.getEvents(CHAIN_ID, REGISTRY, IDENTITY, BLOCK)
    expect(result?.map((e) => e.logIndex)).toEqual([0, 1, 2])
  })

  it('2.12 events persist after 200 ms (no TTL / expiry)', async () => {
    const cache = new InMemoryEthrDidCache()
    await cache.setEvent(makeOwnerEvent())
    await new Promise((r) => setTimeout(r, 200))
    expect(await cache.getEvents(CHAIN_ID, REGISTRY, IDENTITY, BLOCK)).toBeDefined()
  })

  it('2.13 block metadata entries persist after 200 ms (no TTL / expiry)', async () => {
    const cache = new InMemoryEthrDidCache()
    await cache.setBlockMetadata(CHAIN_ID, BLOCK, META)
    await new Promise((r) => setTimeout(r, 200))
    expect(await cache.getBlockMetadata(CHAIN_ID, BLOCK)).toBeDefined()
  })
})

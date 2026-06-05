import { test, expect, expectTypeOf, describe } from 'vitest'
import * as index from '../index'
import type {
  CanonicalDIDEvent,
  CanonicalDIDOwnerChanged,
  CanonicalDIDDelegateChanged,
  CanonicalDIDAttributeChanged,
  EthrDidCache,
  BlockMetadataEntry,
} from '../index'

test('has export definitions', () => {
  expect.assertions(5)
  expect(index.bytes32toString).toBeDefined()
  expect(index.getResolver).toBeDefined()
  expect(index.identifierMatcher).toBeDefined()
  expect(index.stringToBytes32).toBeDefined()
  expect(index.verificationMethodTypes).toBeDefined()
})

describe('Phase 7 — public exports', () => {
  test('7.1 CanonicalDIDEvent union and its three variants are importable as types', () => {
    // Build one of each variant to confirm the type is in scope and correct
    const owner: CanonicalDIDOwnerChanged = {
      eventType: 'DIDOwnerChanged',
      chainId: 1,
      registryAddress: '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b',
      identity: '0xf3beac30c498d9e26865f34fcaa57dbb935b0d74',
      blockNumber: 1,
      blockTimestamp: 1700000000,
      logIndex: 0,
      transactionHash: '0xabc',
      previousChange: 0,
      owner: '0xf3beac30c498d9e26865f34fcaa57dbb935b0d74',
    }
    const delegate: CanonicalDIDDelegateChanged = {
      eventType: 'DIDDelegateChanged',
      chainId: 1,
      registryAddress: '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b',
      identity: '0xf3beac30c498d9e26865f34fcaa57dbb935b0d74',
      blockNumber: 2,
      blockTimestamp: 1700000001,
      logIndex: 0,
      transactionHash: '0xdef',
      previousChange: 1,
      validTo: 9999999999,
      delegateType: 'veriKey',
      delegate: '0x1111111111111111111111111111111111111111',
    }
    const attr: CanonicalDIDAttributeChanged = {
      eventType: 'DIDAttributeChanged',
      chainId: 1,
      registryAddress: '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b',
      identity: '0xf3beac30c498d9e26865f34fcaa57dbb935b0d74',
      blockNumber: 3,
      blockTimestamp: 1700000002,
      logIndex: 0,
      transactionHash: '0x123',
      previousChange: 2,
      validTo: 9999999999,
      name: 'did/pub/Ed25519/veriKey',
      value: '0xabcd',
    }

    // CanonicalDIDEvent is the union — all three are assignable to it
    const events: CanonicalDIDEvent[] = [owner, delegate, attr]
    expect(events).toHaveLength(3)

    // Discriminated union narrows correctly
    for (const e of events) {
      if (e.eventType === 'DIDOwnerChanged') {
        expectTypeOf(e.owner).toBeString()
      } else if (e.eventType === 'DIDDelegateChanged') {
        expectTypeOf(e.delegateType).toBeString()
      } else {
        expectTypeOf(e.name).toBeString()
      }
    }
  })

  test('7.2 EthrDidCache is importable as a type and satisfied by a custom object', () => {
    // If EthrDidCache were not exported, this type annotation would fail to compile.
    const custom: EthrDidCache = {
      getEvents: async () => undefined,
      setEvent: async () => undefined,
      getBlockMetadata: async () => undefined,
      setBlockMetadata: async () => undefined,
    }
    expect(custom).toBeDefined()
  })

  test('7.3 InMemoryEthrDidCache is importable as a value and constructable', () => {
    expect(index.InMemoryEthrDidCache).toBeDefined()
    const cache = new index.InMemoryEthrDidCache()
    expect(cache).toBeInstanceOf(index.InMemoryEthrDidCache)
    // Spot-check the async interface
    expect(typeof cache.getEvents).toBe('function')
    expect(typeof cache.setEvent).toBe('function')
    expect(typeof cache.getBlockMetadata).toBe('function')
    expect(typeof cache.setBlockMetadata).toBe('function')
  })

  test('7.4 BlockMetadataEntry is importable as a type', () => {
    const entry: BlockMetadataEntry = { height: '100', timestamp: 1700000000 }
    expectTypeOf(entry.height).toBeString()
    expectTypeOf(entry.timestamp).toBeNumber()
    expect(entry.height).toBe('100')
    expect(entry.timestamp).toBe(1700000000)
  })
})

import { test, expect, expectTypeOf, describe } from 'vitest'
import * as index from '../index'
import type {
  CanonicalDIDEvent,
  CanonicalDIDOwnerChanged,
  CanonicalDIDDelegateChanged,
  CanonicalDIDAttributeChanged,
  KVStore,
  CachedBlock,
  WrapProviderOptions,
} from '../index'

test('has export definitions', () => {
  expect.assertions(5)
  expect(index.bytes32toString).toBeDefined()
  expect(index.getResolver).toBeDefined()
  expect(index.identifierMatcher).toBeDefined()
  expect(index.stringToBytes32).toBeDefined()
  expect(index.verificationMethodTypes).toBeDefined()
})

describe('public exports', () => {
  test('CanonicalDIDEvent union and its three variants are importable as types', () => {
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

    // CanonicalDIDEvent is the union - all three are assignable to it
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

  test('KVStore is importable as a type', () => {
    const store: KVStore = {
      get: async () => undefined,
      set: async () => store,
    }
    expect(store).toBeDefined()
  })

  test('CachedBlock is importable as a type', () => {
    const block: CachedBlock = { number: 100, timestamp: 1700000000, hash: '0xabc' }
    expectTypeOf(block.number).toBeNumber()
    expectTypeOf(block.timestamp).toBeNumber()
    expectTypeOf(block.hash).toBeString()
    expect(block.number).toBe(100)
    expect(block.timestamp).toBe(1700000000)
    expect(block.hash).toBe('0xabc')
  })

  test('WrapProviderOptions is importable as a type', () => {
    const options: WrapProviderOptions = { finalizedTtlMs: 10000, fallbackDepth: 256 }
    expect(options.finalizedTtlMs).toBe(10000)
    expect(options.fallbackDepth).toBe(256)
  })
})

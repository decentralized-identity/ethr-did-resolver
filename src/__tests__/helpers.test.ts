import { describe, it, expect, expectTypeOf } from 'vitest'
import { clampToSafeInt, CanonicalDIDEvent, CanonicalDIDOwnerChanged } from '../helpers.js'

describe('clampToSafeInt', () => {
  it('1.1 returns 0 for 0n', () => {
    expect(clampToSafeInt(0n)).toBe(0)
  })

  it('1.2 returns 1 for 1n', () => {
    expect(clampToSafeInt(1n)).toBe(1)
  })

  it('1.3 returns Number.MAX_SAFE_INTEGER for BigInt(Number.MAX_SAFE_INTEGER)', () => {
    expect(clampToSafeInt(BigInt(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('1.4 clamps BigInt(Number.MAX_SAFE_INTEGER) + 1n to Number.MAX_SAFE_INTEGER', () => {
    expect(clampToSafeInt(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('1.5 clamps uint256 max (2n ** 256n - 1n) to Number.MAX_SAFE_INTEGER', () => {
    expect(clampToSafeInt(2n ** 256n - 1n)).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('1.6 returns 12345678 for 12345678n', () => {
    expect(clampToSafeInt(12345678n)).toBe(12345678)
  })
})

describe('CanonicalDIDEvent — discriminated union', () => {
  it('1.7 narrowing on DIDDelegateChanged exposes delegateType, delegate, and validTo', () => {
    // Build a concrete delegate event to verify the runtime shape
    const event: CanonicalDIDEvent = {
      eventType: 'DIDDelegateChanged',
      chainId: 1,
      registryAddress: '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b',
      identity: '0xf3beac30c498d9e26865f34fcaa57dbb935b0d74',
      blockNumber: 100,
      blockTimestamp: 1700000000,
      logIndex: 0,
      transactionHash: '0xabc',
      previousChange: 0,
      validTo: 9999999999,
      delegateType: 'veriKey',
      delegate: '0xabcdef1234567890abcdef1234567890abcdef12',
    }

    // Narrow and check all event-specific fields are accessible without a cast
    if (event.eventType === 'DIDDelegateChanged') {
      expectTypeOf(event.delegateType).toBeString()
      expectTypeOf(event.delegate).toBeString()
      expectTypeOf(event.validTo).toBeNumber()
      expect(event.delegateType).toBe('veriKey')
      expect(event.delegate).toBe('0xabcdef1234567890abcdef1234567890abcdef12')
      expect(event.validTo).toBe(9999999999)
    } else {
      throw new Error('Expected DIDDelegateChanged branch')
    }
  })

  it('1.8 DIDOwnerChanged variant does not include delegateType, delegate, or name/value', () => {
    const event: CanonicalDIDOwnerChanged = {
      eventType: 'DIDOwnerChanged',
      chainId: 1,
      registryAddress: '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b',
      identity: '0xf3beac30c498d9e26865f34fcaa57dbb935b0d74',
      blockNumber: 50,
      blockTimestamp: 1699999999,
      logIndex: 0,
      transactionHash: '0xdef',
      previousChange: 0,
      owner: '0xf3beac30c498d9e26865f34fcaa57dbb935b0d74',
    }

    // The type should NOT have delegateType, delegate, or validTo
    // @ts-expect-error — delegateType does not exist on CanonicalDIDOwnerChanged
    const _delegateType = event.delegateType
    // @ts-expect-error — delegate does not exist on CanonicalDIDOwnerChanged
    const _delegate = event.delegate
    // @ts-expect-error — validTo does not exist on CanonicalDIDOwnerChanged
    const _validTo = event.validTo
    // @ts-expect-error — name does not exist on CanonicalDIDOwnerChanged
    const _name = event.name

    expect(event.owner).toBe('0xf3beac30c498d9e26865f34fcaa57dbb935b0d74')
  })
})

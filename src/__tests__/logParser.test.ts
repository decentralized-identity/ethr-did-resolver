import { describe, it, expect, vi } from 'vitest'
import { Contract, Log } from 'ethers'
import { logDecoder } from '../logParser.js'
import { stringToBytes32 } from '../helpers.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHAIN_ID = 1
const REGISTRY = '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b'
const IDENTITY = '0xf3beac30c498d9e26865f34fcaa57dbb935b0d74'
const OWNER = '0xabcdef1234567890abcdef1234567890abcdef12'
const DELEGATE = '0x1111111111111111111111111111111111111111'
const BLOCK_NUMBER = 100
const BLOCK_TIMESTAMP = 1700000000
const TX_HASH = '0xdeadbeef00000000000000000000000000000000000000000000000000000000'

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Creates an args object that supports both index-based AND name-based access,
 * matching what ethers v6 Result provides.
 */
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
    fragment: {
      inputs: [
        { name: 'identity', type: 'address' },
        { name: 'owner', type: 'address' },
        { name: 'previousChange', type: 'uint256' },
      ],
    },
  }
}

function makeDelegateChangedDesc(
  identity: string,
  delegateType: string,
  delegate: string,
  validTo: bigint,
  previousChange: bigint
) {
  return {
    name: 'DIDDelegateChanged',
    args: makeArgs([
      { name: 'identity', val: identity },
      { name: 'delegateType', val: delegateType },
      { name: 'delegate', val: delegate },
      { name: 'validTo', val: validTo },
      { name: 'previousChange', val: previousChange },
    ]),
    fragment: {
      inputs: [
        { name: 'identity', type: 'address' },
        { name: 'delegateType', type: 'bytes32' },
        { name: 'delegate', type: 'address' },
        { name: 'validTo', type: 'uint256' },
        { name: 'previousChange', type: 'uint256' },
      ],
    },
  }
}

function makeAttributeChangedDesc(
  identity: string,
  name: string,
  value: string,
  validTo: bigint,
  previousChange: bigint
) {
  return {
    name: 'DIDAttributeChanged',
    args: makeArgs([
      { name: 'identity', val: identity },
      { name: 'name', val: name },
      { name: 'value', val: value },
      { name: 'validTo', val: validTo },
      { name: 'previousChange', val: previousChange },
    ]),
    fragment: {
      inputs: [
        { name: 'identity', type: 'address' },
        { name: 'name', type: 'bytes32' },
        { name: 'value', type: 'bytes' },
        { name: 'validTo', type: 'uint256' },
        { name: 'previousChange', type: 'uint256' },
      ],
    },
  }
}

function makeLog(overrides: { index?: number; transactionHash?: string } = {}): Log {
  return {
    blockNumber: BLOCK_NUMBER,
    index: 0,
    transactionHash: TX_HASH,
    topics: ['0x0', `0x000000000000000000000000${IDENTITY.slice(2)}`],
    data: '0x',
    address: REGISTRY,
    ...overrides,
  } as unknown as Log
}

function mockContract(desc: unknown): Contract {
  return { interface: { parseLog: vi.fn().mockReturnValue(desc) } } as unknown as Contract
}

function mockContractSequence(descs: unknown[]): Contract {
  const parseLog = vi.fn()
  for (const d of descs) parseLog.mockReturnValueOnce(d)
  return { interface: { parseLog } } as unknown as Contract
}

// ---------------------------------------------------------------------------
// Phase 3 tests
// ---------------------------------------------------------------------------

describe('logDecoder', () => {
  it('3.1 sets blockTimestamp from the parameter on all returned events', () => {
    const contract = mockContract(makeOwnerChangedDesc(IDENTITY, OWNER, 0n))
    const { events } = logDecoder(contract, [makeLog()], BLOCK_NUMBER, BLOCK_TIMESTAMP, CHAIN_ID, REGISTRY)
    expect(events[0].blockTimestamp).toBe(BLOCK_TIMESTAMP)
  })

  it('3.2 sets chainId from the parameter on all returned events', () => {
    const contract = mockContract(makeOwnerChangedDesc(IDENTITY, OWNER, 0n))
    const { events } = logDecoder(contract, [makeLog()], BLOCK_NUMBER, BLOCK_TIMESTAMP, CHAIN_ID, REGISTRY)
    expect(events[0].chainId).toBe(CHAIN_ID)
  })

  it('3.3 lowercases registryAddress on all returned events', () => {
    const contract = mockContract(makeOwnerChangedDesc(IDENTITY, OWNER, 0n))
    const MIXED_REGISTRY = '0xDCA7EF03E98E0DC2B855BE647C39ABE984FCF21B'
    const { events } = logDecoder(contract, [makeLog()], BLOCK_NUMBER, BLOCK_TIMESTAMP, CHAIN_ID, MIXED_REGISTRY)
    expect(events[0].registryAddress).toBe(REGISTRY)
  })

  it('3.4 sets logIndex from log.index on each event', () => {
    const contract = mockContract(makeOwnerChangedDesc(IDENTITY, OWNER, 0n))
    const { events } = logDecoder(contract, [makeLog({ index: 7 })], BLOCK_NUMBER, BLOCK_TIMESTAMP, CHAIN_ID, REGISTRY)
    expect(events[0].logIndex).toBe(7)
  })

  it('3.5 sets transactionHash from log.transactionHash on each event', () => {
    const contract = mockContract(makeOwnerChangedDesc(IDENTITY, OWNER, 0n))
    const hash = '0xcafebabe00000000000000000000000000000000000000000000000000000000'
    const { events } = logDecoder(
      contract,
      [makeLog({ transactionHash: hash })],
      BLOCK_NUMBER,
      BLOCK_TIMESTAMP,
      CHAIN_ID,
      REGISTRY
    )
    expect(events[0].transactionHash).toBe(hash)
  })

  it('3.6 lowercases identity on all returned events', () => {
    const MIXED = '0xF3BEAC30C498D9E26865F34FCAA57DBB935B0D74'
    const contract = mockContract(makeOwnerChangedDesc(MIXED, OWNER, 0n))
    const { events } = logDecoder(contract, [makeLog()], BLOCK_NUMBER, BLOCK_TIMESTAMP, CHAIN_ID, REGISTRY)
    expect(events[0].identity).toBe(IDENTITY)
  })

  it('3.7 lowercases owner on a DIDOwnerChanged event', () => {
    const MIXED_OWNER = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12'
    const contract = mockContract(makeOwnerChangedDesc(IDENTITY, MIXED_OWNER, 0n))
    const { events } = logDecoder(contract, [makeLog()], BLOCK_NUMBER, BLOCK_TIMESTAMP, CHAIN_ID, REGISTRY)
    expect(events[0].eventType).toBe('DIDOwnerChanged')
    if (events[0].eventType === 'DIDOwnerChanged') {
      expect(events[0].owner).toBe(OWNER)
    }
  })

  it('3.8 lowercases delegate on a DIDDelegateChanged event', () => {
    const MIXED_DELEGATE = '0x1111111111111111111111111111111111111111'.toUpperCase().replace('0X', '0x')
    const contract = mockContract(
      makeDelegateChangedDesc(IDENTITY, stringToBytes32('veriKey'), MIXED_DELEGATE, 9999999999n, 0n)
    )
    const { events } = logDecoder(contract, [makeLog()], BLOCK_NUMBER, BLOCK_TIMESTAMP, CHAIN_ID, REGISTRY)
    expect(events[0].eventType).toBe('DIDDelegateChanged')
    if (events[0].eventType === 'DIDDelegateChanged') {
      expect(events[0].delegate).toBe(DELEGATE)
    }
  })

  it('3.9 DecodedLogs.previousChange is a number, not a bigint', () => {
    const contract = mockContract(makeOwnerChangedDesc(IDENTITY, OWNER, 50n))
    const { previousChange } = logDecoder(contract, [makeLog()], BLOCK_NUMBER, BLOCK_TIMESTAMP, CHAIN_ID, REGISTRY)
    expect(typeof previousChange).toBe('number')
  })

  it('3.10 each event has eventType (not _eventName) matching the contract event name', () => {
    const contract = mockContract(makeOwnerChangedDesc(IDENTITY, OWNER, 0n))
    const { events } = logDecoder(contract, [makeLog()], BLOCK_NUMBER, BLOCK_TIMESTAMP, CHAIN_ID, REGISTRY)
    expect(events[0].eventType).toBe('DIDOwnerChanged')
    expect((events[0] as Record<string, unknown>)['_eventName']).toBeUndefined()
  })

  it('3.10b runtime shape matches discriminated-union variant for all three event types', () => {
    const contract = mockContractSequence([
      makeOwnerChangedDesc(IDENTITY, OWNER, 0n),
      makeDelegateChangedDesc(IDENTITY, stringToBytes32('veriKey'), DELEGATE, 9999999999n, 0n),
      makeAttributeChangedDesc(IDENTITY, stringToBytes32('did/pub/Ed25519/veriKey'), '0x1234', 9999999999n, 0n),
    ])
    const { events } = logDecoder(
      contract,
      [makeLog({ index: 0 }), makeLog({ index: 1 }), makeLog({ index: 2 })],
      BLOCK_NUMBER,
      BLOCK_TIMESTAMP,
      CHAIN_ID,
      REGISTRY
    )
    expect(events).toHaveLength(3)

    const [owner, delegate, attr] = events
    // owner
    expect(owner.eventType).toBe('DIDOwnerChanged')
    if (owner.eventType === 'DIDOwnerChanged') expect(owner.owner).toBeTruthy()

    // delegate
    expect(delegate.eventType).toBe('DIDDelegateChanged')
    if (delegate.eventType === 'DIDDelegateChanged') {
      expect(delegate.delegateType).toBeTruthy()
      expect(delegate.delegate).toBeTruthy()
      expect(typeof delegate.validTo).toBe('number')
    }

    // attribute
    expect(attr.eventType).toBe('DIDAttributeChanged')
    if (attr.eventType === 'DIDAttributeChanged') {
      expect(attr.name).toBeTruthy()
      expect(attr.value).toBeTruthy()
      expect(typeof attr.validTo).toBe('number')
    }
  })

  it('3.11 non-UTF-8 bytes32 name is excluded from events but its previousChange advances the chain pointer', () => {
    // 0x80 is an invalid UTF-8 start byte — bytes32toString returns null
    const invalidBytes32 = '0x8000000000000000000000000000000000000000000000000000000000000000'
    const filteredDesc = makeAttributeChangedDesc(IDENTITY, invalidBytes32, '0x', 0n, 30n)
    const validDesc = makeOwnerChangedDesc(IDENTITY, OWNER, 50n)
    const contract = mockContractSequence([filteredDesc, validDesc])
    const { events, previousChange } = logDecoder(
      contract,
      [makeLog({ index: 0 }), makeLog({ index: 1 })],
      BLOCK_NUMBER,
      BLOCK_TIMESTAMP,
      CHAIN_ID,
      REGISTRY
    )
    // Filtered event must not be in events
    expect(events).toHaveLength(1)
    expect(events[0].eventType).toBe('DIDOwnerChanged')
    // But its previousChange (30) < the valid event's (50), so chain pointer is 30
    expect(previousChange).toBe(30)
  })

  it('3.12 validTo on a returned event is a number', () => {
    const contract = mockContract(
      makeDelegateChangedDesc(IDENTITY, stringToBytes32('veriKey'), DELEGATE, 9999999999n, 0n)
    )
    const { events } = logDecoder(contract, [makeLog()], BLOCK_NUMBER, BLOCK_TIMESTAMP, CHAIN_ID, REGISTRY)
    expect(events[0].eventType).toBe('DIDDelegateChanged')
    if (events[0].eventType === 'DIDDelegateChanged') {
      expect(typeof events[0].validTo).toBe('number')
      expect(events[0].validTo).toBe(9999999999)
    }
  })

  it('3.13 uint256-max previousChange is clamped: event.previousChange === MAX_SAFE_INTEGER, chain pointer stays 0', () => {
    const contract = mockContract(makeOwnerChangedDesc(IDENTITY, OWNER, 2n ** 256n - 1n))
    const { events, previousChange: chainPointer } = logDecoder(
      contract,
      [makeLog()],
      BLOCK_NUMBER,
      BLOCK_TIMESTAMP,
      CHAIN_ID,
      REGISTRY
    )
    // Event stores the clamped raw value
    expect(events[0].previousChange).toBe(Number.MAX_SAFE_INTEGER)
    // Chain pointer is NOT updated: MAX_SAFE_INTEGER > BLOCK_NUMBER (100), guard filters it
    expect(chainPointer).toBe(0)
  })

  it('3.14 uint256-max validTo is clamped to Number.MAX_SAFE_INTEGER on the event', () => {
    const contract = mockContract(
      makeDelegateChangedDesc(IDENTITY, stringToBytes32('veriKey'), DELEGATE, 2n ** 256n - 1n, 0n)
    )
    const { events } = logDecoder(contract, [makeLog()], BLOCK_NUMBER, BLOCK_TIMESTAMP, CHAIN_ID, REGISTRY)
    expect(events[0].eventType).toBe('DIDDelegateChanged')
    if (events[0].eventType === 'DIDDelegateChanged') {
      expect(events[0].validTo).toBe(Number.MAX_SAFE_INTEGER)
    }
  })

  it('3.15 minimum previousChange across multiple logs is used as the chain pointer', () => {
    const contract = mockContractSequence([
      makeOwnerChangedDesc(IDENTITY, OWNER, 50n),
      makeOwnerChangedDesc(IDENTITY, OWNER, 30n),
    ])
    const { previousChange } = logDecoder(
      contract,
      [makeLog({ index: 0 }), makeLog({ index: 1 })],
      BLOCK_NUMBER,
      BLOCK_TIMESTAMP,
      CHAIN_ID,
      REGISTRY
    )
    expect(previousChange).toBe(30)
  })

  it('3.16 returned events are sorted by logIndex ASC', () => {
    const contract = mockContractSequence([
      makeOwnerChangedDesc(IDENTITY, OWNER, 0n),
      makeOwnerChangedDesc(IDENTITY, OWNER, 0n),
      makeOwnerChangedDesc(IDENTITY, OWNER, 0n),
    ])
    const { events } = logDecoder(
      contract,
      [makeLog({ index: 5 }), makeLog({ index: 1 }), makeLog({ index: 3 })],
      BLOCK_NUMBER,
      BLOCK_TIMESTAMP,
      CHAIN_ID,
      REGISTRY
    )
    expect(events.map((e) => e.logIndex)).toEqual([1, 3, 5])
  })
})

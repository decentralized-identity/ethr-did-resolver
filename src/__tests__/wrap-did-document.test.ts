import { describe, it, expect } from 'vitest'
import { EthrDidResolver } from '../resolver.js'
import type { CanonicalDIDEvent } from '../helpers.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// wrapDidDocument uses no `this` state - we can call it without a real constructor.
const resolver = Object.create(EthrDidResolver.prototype) as EthrDidResolver

const CHAIN_ID = 1
const REGISTRY = '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b'
const ADDRESS = '0xf3beac30c498d9e26865f34fcaa57dbb935b0d74'
const DELEGATE = '0x1111111111111111111111111111111111111111'
const DID = `did:ethr:${ADDRESS}`
const NOW = Math.floor(Date.now() / 1000)

function makeDelegateEvent(overrides: Partial<CanonicalDIDEvent> = {}): CanonicalDIDEvent {
  const base: CanonicalDIDEvent = {
    eventType: 'DIDDelegateChanged',
    chainId: CHAIN_ID,
    registryAddress: REGISTRY,
    identity: ADDRESS,
    blockNumber: 50,
    blockTimestamp: 1700000000,
    logIndex: 0,
    transactionHash: '0xabc',
    previousChange: 0,
    validTo: NOW + 100_000,
    delegateType: 'veriKey',
    delegate: DELEGATE,
  }
  return { ...base, ...overrides } as CanonicalDIDEvent
}

describe('wrapDidDocument', () => {
  it('4.1 event with validTo === Number.MAX_SAFE_INTEGER is treated as non-expired (key appears in document)', () => {
    const event = makeDelegateEvent({ validTo: Number.MAX_SAFE_INTEGER })
    const { didDocument } = resolver.wrapDidDocument(DID, ADDRESS, undefined, [event], CHAIN_ID, 'latest', NOW)
    // Controller key + delegate key
    expect(didDocument.verificationMethod).toHaveLength(2)
    expect(didDocument.assertionMethod).toContain(`${DID}#delegate-1`)
  })

  it('4.2 event with validTo === 0 is treated as expired (key does not appear in document)', () => {
    const event = makeDelegateEvent({ validTo: 0 })
    const { didDocument } = resolver.wrapDidDocument(DID, ADDRESS, undefined, [event], CHAIN_ID, 'latest', NOW)
    // Only the controller key
    expect(didDocument.verificationMethod).toHaveLength(1)
    expect(didDocument.assertionMethod).not.toContain(`${DID}#delegate-1`)
  })

  it('4.3 wrapDidDocument does not sort its input - event order determines the final document state', () => {
    // Correct order: add at block 50, then revoke at block 100
    const add = makeDelegateEvent({ blockNumber: 50, validTo: Number.MAX_SAFE_INTEGER })
    const revoke = makeDelegateEvent({ blockNumber: 100, validTo: 0 })

    const { didDocument: revokedDoc } = resolver.wrapDidDocument(
      DID,
      ADDRESS,
      undefined,
      [add, revoke], // chronological order → revoke wins
      CHAIN_ID,
      'latest',
      NOW
    )
    expect(revokedDoc.verificationMethod).toHaveLength(1) // only controller

    // Reversed order: revoke then re-add (wrong chronology, but proves no sorting)
    const { didDocument: addedDoc } = resolver.wrapDidDocument(
      DID,
      ADDRESS,
      undefined,
      [revoke, add], // add processed last → key present
      CHAIN_ID,
      'latest',
      NOW
    )
    expect(addedDoc.verificationMethod).toHaveLength(2) // controller + delegate
  })
})

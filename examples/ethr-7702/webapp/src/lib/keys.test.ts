// Unit tests for the well-known-key guard (webapp/src/lib/keys.ts).
// These prevent a public Anvil dev key from being silently reused as a DID
// identity on a live testnet — a key whose huge nonce / leftover delegation
// makes EIP-7702 authorizations silently skipped (see diagnose-did.ts).

import { describe, it, expect } from 'vitest'
import { isWellKnownKey, ANVIL_ACCOUNTS, getAnvilKey } from './keys'
import { privateKeyToAccount } from 'viem/accounts'

describe('isWellKnownKey', () => {
  it('matches every Anvil dev account address', () => {
    for (let i = 0; i < ANVIL_ACCOUNTS.length; i++) {
      expect(isWellKnownKey(privateKeyToAccount(getAnvilKey(i)).address)).toBe(true)
    }
  })

  it('is case-insensitive', () => {
    const addr = privateKeyToAccount(getAnvilKey(0)).address
    expect(isWellKnownKey(addr.toUpperCase())).toBe(true)
    expect(isWellKnownKey(addr.toLowerCase())).toBe(true)
  })

  it('does not flag an arbitrary address', () => {
    expect(isWellKnownKey('0x0000000000000000000000000000000000000001')).toBe(false)
    expect(isWellKnownKey('0x80d26Bbc518837688F4F8d076de6E5B15295afb7')).toBe(false)
  })

  it('handles undefined', () => {
    expect(isWellKnownKey(undefined)).toBe(false)
  })
})

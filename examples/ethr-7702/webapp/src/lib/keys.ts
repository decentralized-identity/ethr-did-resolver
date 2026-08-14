// Browser key manager for the interactive explainer.
//
// Because MetaMask (and most injected wallets) cannot sign EIP-7702 authorization
// tuples from a dapp, the explainer manages local accounts entirely in the
// browser. Keys are persisted to localStorage so the DID subject's keys survive
// reloads — the app fully manages the DIDs/keys it uses.

import { type Hex } from 'viem'
import { privateKeyToAccount, generatePrivateKey, type PrivateKeyAccount } from 'viem/accounts'

// The well-known Anvil dev keys (mnemonic "test test test ... junk").
// Used only in local (Anvil) mode — pre-funded, safe, public test keys.
export const ANVIL_PRIVATE_KEYS: readonly Hex[] = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
  '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e',
  '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356',
  '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97',
  '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6',
] as const

/**
 * The dedicated broadcaster for local (Anvil) mode: a fixed, pre-funded dev key
 * that pays the gas for every relayed transaction. Distinct from all KeyManager
 * roles so the identity/session/signer keys never pay gas.
 */
export const ANVIL_BROADCASTER_INDEX = 6
export const ANVIL_BROADCASTER_PRIVATE_KEY: Hex = ANVIL_PRIVATE_KEYS[ANVIL_BROADCASTER_INDEX]

/** The 10 public addresses behind ANVIL_PRIVATE_KEYS (lowercase). */
export const ANVIL_ACCOUNTS: readonly string[] = ANVIL_PRIVATE_KEYS.map(
  (pk) => privateKeyToAccount(pk).address.toLowerCase()
)

/**
 * True if `address` is one of the well-known Anvil dev accounts. These keys are
 * public and heavily used on live testnets (e.g. #0 has a nonce of ~47k on
 * Sepolia), so their EIP-7702 authorizations are routinely invalidated and they
 * can carry leftover persistent delegation. They must never be used as the DID
 * identity on a real network.
 */
export function isWellKnownKey(address: string | undefined): boolean {
  if (!address) return false
  return ANVIL_ACCOUNTS.includes(address.toLowerCase())
}

export function getAnvilKey(index: number): Hex {
  return ANVIL_PRIVATE_KEYS[index % ANVIL_PRIVATE_KEYS.length]
}

export type KeyRole = 'identity' | 'sessionKey' | 'signer1' | 'signer2' | 'signer3'

export const KEY_ROLES: KeyRole[] = ['identity', 'sessionKey', 'signer1', 'signer2', 'signer3']

const STORAGE_KEY = 'ethr-7702.keyring.v1'

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

function loadPersisted(): Partial<Record<KeyRole, Hex>> | null {
  const ls = storage()
  if (!ls) return null
  const raw = ls.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, string>
    const out: Partial<Record<KeyRole, Hex>> = {}
    for (const role of KEY_ROLES) {
      if (typeof parsed[role] === 'string') out[role] = parsed[role] as Hex
    }
    return out
  } catch {
    return null
  }
}

/**
 * A mutable account store persisted to localStorage. On construction, every role
 * is restored from storage (if present) or seeded with a fresh random key. In
 * local mode, call `seedWithAnvilKeys()` to replace them with the pre-funded
 * Anvil dev keys.
 */
export class KeyManager {
  private keys = new Map<KeyRole, Hex>()

  constructor() {
    const persisted = loadPersisted()
    for (const role of KEY_ROLES) {
      const pk = persisted?.[role]
      this.keys.set(role, pk ?? generatePrivateKey())
    }
    this.persist()
  }

  private persist(): void {
    const ls = storage()
    if (!ls) return
    const raw: Record<string, string> = {}
    for (const role of KEY_ROLES) raw[role] = this.key(role)
    ls.setItem(STORAGE_KEY, JSON.stringify(raw))
  }

  key(role: KeyRole): Hex {
    const pk = this.keys.get(role)
    if (!pk) throw new Error(`No key for role ${role}`)
    return pk
  }

  seedWithAnvilKeys(): void {
    KEY_ROLES.forEach((role, i) => this.keys.set(role, getAnvilKey(i)))
    this.persist()
  }

  account(role: KeyRole): PrivateKeyAccount {
    return privateKeyToAccount(this.key(role))
  }

  address(role: KeyRole): Hex {
    return this.account(role).address
  }

  importKey(role: KeyRole, privateKey: Hex): void {
    this.keys.set(role, privateKey)
    this.persist()
  }

  rotate(role: KeyRole): void {
    this.keys.set(role, generatePrivateKey())
    this.persist()
  }

  /** Wipe the persisted keyring and reseed with fresh random keys. */
  reset(): void {
    for (const role of KEY_ROLES) this.keys.set(role, generatePrivateKey())
    this.persist()
  }

  all(): Record<KeyRole, Hex> {
    const out = {} as Record<KeyRole, Hex>
    for (const role of KEY_ROLES) out[role] = this.address(role)
    return out
  }
}

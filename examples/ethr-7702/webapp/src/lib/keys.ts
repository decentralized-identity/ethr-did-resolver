// In-memory key manager for the interactive explainer.
//
// Because MetaMask (and most injected wallets) cannot sign EIP-7702 authorization
// tuples from a dapp, the explainer manages local accounts entirely in browser
// memory. Keys never leave the page and are not persisted anywhere.

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

export type KeyRole =
  | 'identity' // the DID subject (EOA whose DID doc is updated)
  | 'sessionKey' // Pattern 3
  | 'sponsor' // Patterns 2, 1a, 7
  | 'signer1' // Pattern 4
  | 'signer2'
  | 'signer3'

export const KEY_ROLES: KeyRole[] = ['identity', 'sessionKey', 'sponsor', 'signer1', 'signer2', 'signer3']

export function getAnvilKey(index: number): Hex {
  return ANVIL_PRIVATE_KEYS[index % ANVIL_PRIVATE_KEYS.length]
}

/**
 * A mutable in-memory account store. On construction, every role is seeded with
 * a random burner key. In local mode, call `seedWithAnvilKeys()` to replace them
 * with the pre-funded Anvil dev keys.
 */
export class KeyManager {
  private accounts = new Map<KeyRole, PrivateKeyAccount>()

  constructor(seedRandom = true) {
    if (seedRandom) {
      for (const role of KEY_ROLES) this.accounts.set(role, privateKeyToAccount(generatePrivateKey()))
    }
  }

  seedWithAnvilKeys(): void {
    KEY_ROLES.forEach((role, i) => this.accounts.set(role, privateKeyToAccount(getAnvilKey(i))))
  }

  account(role: KeyRole): PrivateKeyAccount {
    const acc = this.accounts.get(role)
    if (!acc) throw new Error(`No key for role ${role}`)
    return acc
  }

  address(role: KeyRole): Hex {
    return this.account(role).address
  }

  importKey(role: KeyRole, privateKey: Hex): void {
    this.accounts.set(role, privateKeyToAccount(privateKey))
  }

  rotate(role: KeyRole): void {
    this.accounts.set(role, privateKeyToAccount(generatePrivateKey()))
  }

  all(): Record<KeyRole, Hex> {
    const out = {} as Record<KeyRole, Hex>
    for (const role of KEY_ROLES) out[role] = this.address(role)
    return out
  }
}

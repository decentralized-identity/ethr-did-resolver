// viem client factory for the explainer.
//
// Every pattern in src/patterns/* takes a signer WalletClient + a broadcaster
// WalletClient + a PublicClient. The signer is a local key from the KeyManager;
// the broadcaster is either a fixed Anvil dev key (local mode) or the connected
// injected wallet (testnet) that pays the gas.

import { createPublicClient, createWalletClient, custom, http, type Hex, type Address, type WalletClient } from 'viem'
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import type { NetworkConfig } from '../config/chains'
import { ANVIL_BROADCASTER_PRIVATE_KEY } from './keys'

export function makePublicClient(network: NetworkConfig) {
  return createPublicClient({
    chain: network.chain,
    transport: http(network.rpcUrl),
  })
}

export function makeWalletClient(
  network: NetworkConfig,
  privateKey: Hex
) {
  const account = privateKeyToAccount(privateKey)
  return createWalletClient({
    chain: network.chain,
    transport: http(network.rpcUrl),
    account,
  })
}

export function makeWalletClientFromAccount(
  network: NetworkConfig,
  account: PrivateKeyAccount
) {
  return createWalletClient({
    chain: network.chain,
    transport: http(network.rpcUrl),
    account,
  })
}

/** Broadcaster for local (Anvil) mode: a fixed pre-funded dev key. */
export function makeAnvilBroadcasterClient(network: NetworkConfig) {
  return makeWalletClient(network, ANVIL_BROADCASTER_PRIVATE_KEY)
}

export type EIP1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
}

/**
 * Broadcaster for testnet mode: the connected injected wallet. The account
 * address is passed explicitly (viem signs via the EIP-1193 provider for that
 * account).
 */
export function makeInjectedWalletClient(network: NetworkConfig, provider: EIP1193Provider, address: Address) {
  return createWalletClient({
    chain: network.chain,
    transport: custom(provider as never),
    account: address,
  })
}

/** Request account access from an injected wallet (MetaMask, Rabby, …). */
export async function requestAccounts(provider: EIP1193Provider): Promise<Address[]> {
  const accounts = await provider.request({ method: 'eth_requestAccounts' })
  return accounts as Address[]
}

/** Read the currently connected accounts without prompting. */
export async function getConnectedAccounts(provider: EIP1193Provider): Promise<Address[]> {
  const accounts = await provider.request({ method: 'eth_accounts' })
  return accounts as Address[]
}

export function injectedProvider(): EIP1193Provider | null {
  const w = window as unknown as { ethereum?: EIP1193Provider }
  return w.ethereum ?? null
}

export type SentTxRecord = { hash: Hex; type4: boolean }

const sentByClient = new WeakMap<object, SentTxRecord[]>()

/**
 * Wrap a wallet client so every `sendTransaction` is recorded with whether it
 * carried an EIP-7702 `authorizationList`. The webapp uses this to verify,
 * post-hoc on the mined tx, that a wallet really broadcast a type-4 tx instead
 * of silently stripping the authorization (see type4.ts:verifyMinedType4).
 */
export function makeTrackingWalletClient(client: WalletClient): WalletClient {
  const sent: SentTxRecord[] = []
  const proxy = new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'sendTransaction') {
        const original = Reflect.get(target, prop, receiver) as (args: { authorizationList?: unknown[] }) => Promise<Hex>
        return async (args: { authorizationList?: unknown[] }) => {
          const hash = await original.call(target, args)
          sent.push({ hash, type4: Boolean(args?.authorizationList?.length) })
          return hash
        }
      }
      return Reflect.get(target, prop, receiver)
    },
  })
  sentByClient.set(proxy, sent)
  return proxy
}

/** Sent txs recorded for a client returned by `makeTrackingWalletClient`. */
export function getSentTxs(client: WalletClient): SentTxRecord[] {
  return sentByClient.get(client) ?? []
}

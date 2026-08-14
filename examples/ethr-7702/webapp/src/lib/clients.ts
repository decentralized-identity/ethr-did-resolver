// viem client factory for the explainer.
//
// Every pattern in src/patterns/* takes a signer WalletClient + a broadcaster
// WalletClient + a PublicClient. The signer is a local key from the KeyManager;
// the broadcaster is a fixed Anvil dev key that pays the gas (EIP-7702 type-4
// txs are signed + broadcast locally, so no injected wallet can strip them).

import { createPublicClient, createWalletClient, http, type Hex } from 'viem'
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import type { NetworkConfig } from '../config/chains'
import { ANVIL_BROADCASTER_PRIVATE_KEY } from './keys'

export function makePublicClient(network: NetworkConfig) {
  return createPublicClient({
    chain: network.chain,
    transport: http(network.rpcUrl),
  })
}

export function makeWalletClient(network: NetworkConfig, privateKey: Hex) {
  const account = privateKeyToAccount(privateKey)
  return createWalletClient({
    chain: network.chain,
    transport: http(network.rpcUrl),
    account,
  })
}

export function makeWalletClientFromAccount(network: NetworkConfig, account: PrivateKeyAccount) {
  return createWalletClient({
    chain: network.chain,
    transport: http(network.rpcUrl),
    account,
  })
}

/** Broadcaster: a fixed pre-funded Anvil dev key that pays all the gas. */
export function makeAnvilBroadcasterClient(network: NetworkConfig) {
  return makeWalletClient(network, ANVIL_BROADCASTER_PRIVATE_KEY)
}
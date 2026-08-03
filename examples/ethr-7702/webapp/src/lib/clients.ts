// viem client factory for the explainer.
//
// Every pattern in src/patterns/* takes a WalletClient + PublicClient and the
// delegating EOA is identified by `walletClient.account.address`. The explainer
// builds a fresh wallet client per role from the KeyManager.

import { createPublicClient, createWalletClient, http, type Hex } from 'viem'
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import type { NetworkConfig } from '../config/chains'

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

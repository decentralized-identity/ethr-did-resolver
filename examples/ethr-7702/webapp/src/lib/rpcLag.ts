// Mitigations for public-RPC read-after-write lag.
//
// Public testnet RPC endpoints (Sepolia/Gnosis via publicnode.com) are
// load-balanced across multiple backend nodes. Broadcasting a tx and then
// immediately reading (resolving a DID doc, or checking eth_getCode right
// after a deploy) can hit a replica that hasn't indexed the new block yet,
// making a just-confirmed write look "missing". Anvil is a single node with
// no such lag, which is why this never surfaced in local testing.
//
// Both helpers are bounded retries/polls — best effort, not a guarantee.

import type { Address, PublicClient } from 'viem'
import { isDeployed } from './create2'

/** Poll until the RPC endpoint's view of the chain reaches `minBlock`. */
export async function waitForBlockVisible(
  publicClient: Pick<PublicClient, 'getBlockNumber'>,
  minBlock: bigint,
  timeoutMs = 12_000,
  pollMs = 800
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const current = await publicClient.getBlockNumber().catch(() => 0n)
    if (current >= minBlock) return
    await new Promise((r) => setTimeout(r, pollMs))
  }
}

/** Retry an `eth_getCode` check a few times with a short delay. */
export async function waitUntilDeployed(
  publicClient: PublicClient,
  address: Address,
  attempts = 8,
  delayMs = 800
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (await isDeployed(publicClient, address)) return true
    await new Promise((r) => setTimeout(r, delayMs))
  }
  return false
}

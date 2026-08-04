// EIP-7702 (type-4) wallet support detection for the explainer.
//
// There is NO standardized wallet capability flag for EIP-7702 the way
// EIP-5792/CAIP-25 defines e.g. `atomicBatch` or `paymasterService`. So
// detection is best-effort:
//   1. `wallet_getCapabilities` (EIP-5792) — a positive signal if the wallet
//      advertises a 7702 capability key.
//   2. wallet brand flags (isRabby / isMetaMask / …) — a known-support matrix.
// The only GROUND TRUTH is inspecting the MINED transaction after a broadcast:
// a wallet that doesn't support type-4 silently downgrades to a legacy tx and
// drops the authorizationList — which `verifyMinedType4` catches post-hoc.

import type { Hash, PublicClient } from 'viem'
import type { EIP1193Provider } from './clients'

export type Type4Support = 'supported' | 'unsupported' | 'unknown'

export type WalletBrand = 'rabby' | 'metamask' | 'brave' | 'other'

/** Best-effort brand detection from the injected provider's feature flags. */
export function detectWalletBrand(provider: EIP1193Provider): WalletBrand {
  const flags = provider as unknown as Record<string, unknown>
  if (flags.isRabby) return 'rabby'
  if (flags.isMetaMask) return 'metamask'
  if (flags.isBraveWallet) return 'brave'
  return 'other'
}

/**
 * Known-support matrix. `null` means "no reliable signal — leave it unknown".
 * - Rabby fully supports EIP-7702 type-4 txs.
 * - MetaMask accepts type-4 only for its curated "blessed" delegate list; for
 *   any other delegate it silently strips the authorizationList and sends a
 *   legacy no-op — treated as unsupported for our manager contracts.
 */
const BRAND_SUPPORT: Partial<Record<WalletBrand, Type4Support>> = {
  rabby: 'supported',
  metamask: 'unsupported',
}

/** Capability keys some wallets expose for EIP-7702 (non-standard, best-effort). */
const CAPABILITY_KEYS = ['7702', 'eip7702', '0x04', 'type4', 'type-4'] as const

export async function detectType4Support(provider: EIP1193Provider): Promise<Type4Support> {
  // 1. Explicit capability signal (positive only).
  try {
    const caps = (await provider.request({ method: 'wallet_getCapabilities', params: [] })) as
      | Record<string, unknown>
      | null
      | undefined
    if (caps && typeof caps === 'object') {
      for (const chain of Object.values(caps)) {
        if (chain && typeof chain === 'object') {
          const c = chain as Record<string, unknown>
          if (CAPABILITY_KEYS.some((key) => key in c)) return 'supported'
        }
      }
    }
  } catch {
    // wallet_getCapabilities is not implemented by this wallet — fall through.
  }

  // 2. Brand matrix.
  return BRAND_SUPPORT[detectWalletBrand(provider)] ?? 'unknown'
}

export type Type4Verification = { ok: true } | { ok: false; reason: string }

/**
 * Ground truth: confirm a mined tx really is EIP-7702 (type 0x04). A wallet
 * that doesn't support type-4 silently broadcasts a legacy tx with no
 * authorization, which this check reliably catches via eth_getTransactionByHash.
 */
export async function verifyMinedType4(
  publicClient: PublicClient,
  txHash: Hash
): Promise<Type4Verification> {
  let tx
  try {
    tx = await publicClient.getTransaction({ hash: txHash })
  } catch {
    return { ok: false, reason: 'could not fetch the mined transaction to verify its type' }
  }
  if (tx.type !== 'eip7702') {
    return {
      ok: false,
      reason: `mined as ${tx.type}, not 0x04 — the wallet dropped the EIP-7702 authorizationList`,
    }
  }
  return { ok: true }
}
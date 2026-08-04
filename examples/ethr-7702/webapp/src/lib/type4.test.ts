// Unit tests for EIP-7702 wallet support detection (webapp/src/lib/type4.ts)
// and the tx-tracking client wrapper (webapp/src/lib/clients.ts).

import { describe, it, expect } from 'vitest'
import { detectType4Support, detectWalletBrand, verifyMinedType4 } from './type4'
import { makeTrackingWalletClient, getSentTxs, type EIP1193Provider } from './clients'

const noCapsProvider = (flags: Record<string, unknown>) =>
  ({
    ...flags,
    request: async () => {
      throw new Error('wallet_getCapabilities not implemented')
    },
  }) as unknown as EIP1193Provider

describe('detectWalletBrand', () => {
  it('identifies Rabby, MetaMask, Brave, and other', () => {
    expect(detectWalletBrand({ isRabby: true, isMetaMask: true } as never)).toBe('rabby')
    expect(detectWalletBrand({ isMetaMask: true, isBraveWallet: true } as never)).toBe('metamask')
    expect(detectWalletBrand({ isBraveWallet: true } as never)).toBe('brave')
    expect(detectWalletBrand({} as never)).toBe('other')
  })
})

describe('detectType4Support', () => {
  it('trusts an explicit wallet_getCapabilities 7702 key', async () => {
    const provider = {
      request: async ({ method }: { method: string }) => {
        if (method === 'wallet_getCapabilities') return { '0x1': { 7702: {} } }
        throw new Error('unexpected method')
      },
    } as unknown as EIP1193Provider
    expect(await detectType4Support(provider)).toBe('supported')
  })

  it('maps Rabby to supported', async () => {
    expect(await detectType4Support(noCapsProvider({ isRabby: true }))).toBe('supported')
  })

  it('maps MetaMask to unsupported', async () => {
    expect(await detectType4Support(noCapsProvider({ isMetaMask: true }))).toBe('unsupported')
  })

  it('returns unknown for an unrecognized wallet without capabilities', async () => {
    expect(await detectType4Support(noCapsProvider({}))).toBe('unknown')
  })

  it('falls back to brand when capabilities have no 7702 key', async () => {
    const provider = {
      isMetaMask: true,
      request: async () => ({ '0x1': { atomicBatch: {} } }),
    } as unknown as EIP1193Provider
    expect(await detectType4Support(provider)).toBe('unsupported')
  })
})

describe('makeTrackingWalletClient', () => {
  it('records whether each sent tx carried an authorizationList', async () => {
    const base = {
      sendTransaction: async () => '0xabc',
    } as unknown as never
    const wrapped = makeTrackingWalletClient(base)
    await wrapped.sendTransaction({ authorizationList: [{ chainId: 1n }] } as never)
    await wrapped.sendTransaction({} as never)
    const sent = getSentTxs(wrapped)
    expect(sent).toEqual([
      { hash: '0xabc', type4: true },
      { hash: '0xabc', type4: false },
    ])
  })

  it('unwrapped clients have no recorded sends', () => {
    expect(getSentTxs({} as never)).toEqual([])
  })
})

describe('verifyMinedType4', () => {
  it('passes for a mined eip7702 tx', async () => {
    const client = { getTransaction: async () => ({ type: 'eip7702' }) }
    expect(await verifyMinedType4(client as never, '0xabc')).toEqual({ ok: true })
  })

  it('flags a wallet-stripped (non-type-4) mined tx', async () => {
    const client = { getTransaction: async () => ({ type: 'legacy' }) }
    const r = await verifyMinedType4(client as never, '0xabc')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('legacy')
  })

  it('flags a tx that could not be fetched', async () => {
    const client = { getTransaction: async () => { throw new Error('not found') } }
    const r = await verifyMinedType4(client as never, '0xabc')
    expect(r.ok).toBe(false)
  })
})
// Unit tests for the public-RPC read-after-write lag mitigations.
//
// These use fake, controllable publicClient stand-ins (no real network) to
// prove the retry/poll behavior actually works: waitForBlockVisible resolves
// once the observed block number reaches the target (and gives up after a
// timeout if it never does), and waitUntilDeployed retries getCode until code
// appears (or exhausts its attempts).

import { describe, it, expect, vi } from 'vitest'
import { waitForBlockVisible, waitUntilDeployed } from './rpcLag'

describe('waitForBlockVisible', () => {
  it('returns as soon as the observed block number reaches minBlock', async () => {
    let calls = 0
    const publicClient = {
      getBlockNumber: vi.fn(async () => {
        calls += 1
        // Simulate a lagging replica for the first 2 polls, then caught up.
        return calls < 3 ? 10n : 15n
      }),
    }
    await waitForBlockVisible(publicClient, 15n, 5_000, 5)
    expect(calls).toBe(3)
  })

  it('returns immediately if already at or past minBlock', async () => {
    const publicClient = { getBlockNumber: vi.fn(async () => 20n) }
    await waitForBlockVisible(publicClient, 15n, 5_000, 5)
    expect(publicClient.getBlockNumber).toHaveBeenCalledTimes(1)
  })

  it('gives up after the timeout without throwing if the block never appears', async () => {
    const publicClient = { getBlockNumber: vi.fn(async () => 1n) }
    await expect(waitForBlockVisible(publicClient, 999n, 30, 10)).resolves.toBeUndefined()
    // Bounded: didn't poll forever.
    expect(publicClient.getBlockNumber.mock.calls.length).toBeLessThan(10)
  })

  it('treats a failed getBlockNumber call as "not there yet" rather than throwing', async () => {
    let calls = 0
    const publicClient = {
      getBlockNumber: vi.fn(async () => {
        calls += 1
        if (calls === 1) throw new Error('RPC hiccup')
        return 5n
      }),
    }
    await expect(waitForBlockVisible(publicClient, 5n, 5_000, 5)).resolves.toBeUndefined()
    expect(calls).toBe(2)
  })
})

describe('waitUntilDeployed', () => {
  it('retries getCode until code appears, then returns true', async () => {
    let calls = 0
    const publicClient = {
      getCode: vi.fn(async () => {
        calls += 1
        return calls < 3 ? '0x' : '0x600160'
      }),
    } as unknown as Parameters<typeof waitUntilDeployed>[0]
    const ok = await waitUntilDeployed(publicClient, '0xabc0000000000000000000000000000000000a', 10, 1)
    expect(ok).toBe(true)
    expect(calls).toBe(3)
  })

  it('gives up and returns false after exhausting attempts', async () => {
    const publicClient = {
      getCode: vi.fn(async () => '0x'),
    } as unknown as Parameters<typeof waitUntilDeployed>[0]
    const ok = await waitUntilDeployed(publicClient, '0xabc0000000000000000000000000000000000a', 3, 1)
    expect(ok).toBe(false)
    expect(publicClient.getCode).toHaveBeenCalledTimes(3)
  })
})

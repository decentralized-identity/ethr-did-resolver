// test/setup.ts
// Per-test snapshot/revert using viem test client

import { beforeEach, afterEach } from 'vitest'
import { createTestClient, http } from 'viem'
import { anvil as anvilChain } from 'viem/chains'
import { ANVIL_RPC_URL } from '../src/utils/anvil.js'

const testClient = createTestClient({
  mode: 'anvil',
  chain: anvilChain,
  transport: http(ANVIL_RPC_URL),
})

let snapshotId: `0x${string}`

beforeEach(async () => {
  snapshotId = await testClient.snapshot()
})

afterEach(async () => {
  await testClient.revert({ id: snapshotId })
})

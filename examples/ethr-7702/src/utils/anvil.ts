// src/utils/anvil.ts
// Functions for managing an Anvil process lifecycle

import { ChildProcess, spawn } from 'child_process'

const ANVIL_BINARY = process.env.ANVIL_BINARY ?? `${process.env.HOME}/.foundry/bin/anvil`
const ANVIL_PORT = 8545
const ANVIL_HOST = '127.0.0.1'
export const ANVIL_RPC_URL = `http://${ANVIL_HOST}:${ANVIL_PORT}`

export type AnvilInstance = {
  process: ChildProcess
  rpcUrl: string
  port: number
}

// Default Anvil dev accounts (from mnemonic "test test test test test test test test test test test junk")
const ANVIL_PRIVATE_KEYS = [
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

const ANVIL_ACCOUNTS = [
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
  '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
  '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
  '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955',
  '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f',
  '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
] as const

export function getAnvilAccounts(): readonly `0x${string}`[] {
  return ANVIL_ACCOUNTS
}

export function getAnvilPrivateKeys(): readonly `0x${string}`[] {
  return ANVIL_PRIVATE_KEYS
}

export async function waitForAnvil(rpcUrl: string, maxAttempts = 50): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 }),
      })
      if (res.ok) return
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`Anvil did not become ready at ${rpcUrl} after ${maxAttempts} attempts`)
}

export async function startAnvil(): Promise<AnvilInstance> {
  const proc = spawn(
    ANVIL_BINARY,
    ['--hardfork', 'prague', '--port', String(ANVIL_PORT), '--host', ANVIL_HOST, '--silent'],
    { detached: false, stdio: 'ignore' }
  )

  proc.on('error', (err) => {
    throw new Error(`Failed to start Anvil: ${err.message}`)
  })

  await waitForAnvil(ANVIL_RPC_URL)

  return { process: proc, rpcUrl: ANVIL_RPC_URL, port: ANVIL_PORT }
}

export async function stopAnvil(instance: AnvilInstance): Promise<void> {
  return new Promise((resolve) => {
    const proc = instance.process
    if (proc.exitCode !== null) {
      resolve()
      return
    }
    proc.once('exit', () => resolve())
    proc.kill('SIGTERM')
    setTimeout(() => {
      if (proc.exitCode === null) proc.kill('SIGKILL')
    }, 2000)
  })
}

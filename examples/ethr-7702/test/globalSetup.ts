// test/globalSetup.ts
// vitest globalSetup: starts Anvil, deploys contracts, writes env to /tmp

import { writeFileSync, existsSync } from 'fs'
import { execSync } from 'child_process'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { anvil as anvilChain } from 'viem/chains'
import { startAnvil, stopAnvil, getAnvilPrivateKeys, type AnvilInstance } from '../src/utils/anvil.js'
import { deployAll } from '../src/deploy.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export const TEST_ENV_FILE = '/tmp/ethr-7702-test-env.json'

let anvilInstance: AnvilInstance | null = null

function ensureArtifacts(): void {
  const artifactPath = join(__dirname, '..', 'artifacts', 'DIDManager7702.json')
  if (!existsSync(artifactPath)) {
    console.log('[globalSetup] Artifacts missing — compiling contracts...')
    execSync('pnpm tsx scripts/compile.ts', {
      cwd: join(__dirname, '..'),
      stdio: 'inherit',
    })
  }
}

export async function setup(): Promise<void> {
  ensureArtifacts()

  anvilInstance = await startAnvil()

  const account = privateKeyToAccount(getAnvilPrivateKeys()[0])

  const publicClient = createPublicClient({
    chain: anvilChain,
    transport: http(anvilInstance.rpcUrl),
  })

  const walletClient = createWalletClient({
    chain: anvilChain,
    transport: http(anvilInstance.rpcUrl),
    account,
  })

  const contracts = await deployAll(walletClient, publicClient)

  writeFileSync(
    TEST_ENV_FILE,
    JSON.stringify({
      rpcUrl: anvilInstance.rpcUrl,
      chainId: anvilChain.id,
      contracts,
    })
  )
}

export async function teardown(): Promise<void> {
  if (anvilInstance) {
    await stopAnvil(anvilInstance)
    anvilInstance = null
  }
}

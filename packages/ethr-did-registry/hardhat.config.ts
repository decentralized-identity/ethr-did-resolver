import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'hardhat/config'
import type { NetworkUserConfig } from 'hardhat/types/config'
import hardhatEthers from '@nomicfoundation/hardhat-ethers'
import hardhatTypechain from '@nomicfoundation/hardhat-typechain'
import hardhatMocha from '@nomicfoundation/hardhat-mocha'
import hardhatChaiMatchers from '@nomicfoundation/hardhat-ethers-chai-matchers'

// Load deployment credentials from .env before config resolution. The file is
// gitignored (see .env.example) — key material never enters the repository.
const configDir = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(configDir, '.env')
if (existsSync(envFile)) {
  process.loadEnvFile(envFile)
}

const { DEPLOY_RPC_URL, DEPLOY_PRIVATE_KEY, DEPLOY_CHAIN_ID } = process.env

/**
 * The `deploy` network exists only when `DEPLOY_RPC_URL` is set. It is the
 * target of `pnpm run deploy:registry` (scripts/deploy.ts) — see docs/deploy.md. When a
 * private key is configured, Hardhat signs transactions locally and submits
 * them as raw transactions; without one, the RPC node's own accounts are used.
 */
const hardhatNetwork: NetworkUserConfig = {
  type: 'edr-simulated' as const,
  chainId: 1337,
  hardfork: 'prague' as const,
  allowBlocksWithSameTimestamp: true,
} as const

const deployNetwork: NetworkUserConfig | undefined =
  DEPLOY_RPC_URL === undefined
    ? undefined
    : {
        type: 'http' as const,
        url: DEPLOY_RPC_URL,
        accounts: DEPLOY_PRIVATE_KEY === undefined ? undefined : [DEPLOY_PRIVATE_KEY],
        ...(DEPLOY_CHAIN_ID === undefined ? {} : { chainId: Number(DEPLOY_CHAIN_ID) }),
      }

const networks: Record<string, NetworkUserConfig> =
  deployNetwork === undefined
    ? { hardhat: hardhatNetwork }
    : { hardhat: hardhatNetwork, deploy: deployNetwork }

export default defineConfig({
  plugins: [hardhatEthers, hardhatTypechain, hardhatMocha, hardhatChaiMatchers],
  paths: {
    tests: './src/__tests__',
  },
  typechain: {
    outDir: `./src/typechain-types`,
  },
  solidity: {
    version: '0.8.36',
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },
  networks,
})

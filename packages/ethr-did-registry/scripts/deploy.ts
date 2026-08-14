/**
 * Plain deployment script for the EthereumDIDRegistry contract.
 *
 * No framework (no Ignition, no deploy plugin). It connects to the network
 * selected with `--network`, deploys the compiled artifact through the typed
 * factory, and prints a complete source-verification record: contract address,
 * tx hash, chainId, solc version, optimizer settings (enabled + runs, plus
 * viaIR/evmVersion if set), source hash, and license — everything a block
 * explorer needs to source-verify the deployment, doubling as the audit trail
 * that the deployment happened.
 *
 * Usage (from this package root):
 *
 *   cp .env.example .env        # fill in DEPLOY_RPC_URL (+ DEPLOY_PRIVATE_KEY)
 *   pnpm run deploy:registry    # == hardhat run scripts/deploy.ts --network deploy
 *
 * The `deploy` network is registered in hardhat.config.ts only when
 * DEPLOY_RPC_URL is set; credentials come from the environment, never from the
 * repository (`.env` is gitignored, see .env.example). See docs/deploy.md for
 * the full runbook.
 *
 * Hand-off: the registry package does not own deployments. After a successful
 * deployment, open a PR against the resolver package adding the new deployment
 * record to `packages/ethr-did-resolver/src/config/deployments.ts` (chainId +
 * registry address, plus optional name/description/rpcUrl), and paste the JSON
 * verification record printed below into the PR description. This script never
 * writes another package's files.
 *
 * Deterministic (CREATE2) deployment is intentionally NOT implemented — the
 * mechanism choice is deferred per docs/adr/0001-registry-package-modern-scaffolding.md.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserProvider, keccak256, toUtf8Bytes } from 'ethers'
import hre from 'hardhat'
import { EthereumDIDRegistry__factory } from '../typechain-types/index.js'

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const ARTIFACT_PATH = 'artifacts/contracts/EthereumDIDRegistry.sol/EthereumDIDRegistry.json'
const SOURCE_PATH = 'contracts/EthereumDIDRegistry.sol'

/** Solc optimizer settings, as recorded in the build-info input. */
interface SolcOptimizerSettings {
  enabled: boolean
  runs?: number
}

/** The subset of a Hardhat build-info file the verification record needs. */
interface BuildInfo {
  solcVersion: string
  solcLongVersion: string
  input: {
    settings: {
      optimizer?: SolcOptimizerSettings
      viaIR?: boolean
      evmVersion?: string
    }
  }
}

/** The subset of the contract artifact the verification record needs. */
interface ArtifactJson {
  buildInfoId?: string
  bytecode: string
  deployedBytecode: string
}

/**
 * The verification record of a deployment: everything needed to source-verify
 * the deployed contract. Doubles as the audit trail that the deployment
 * happened (see CONTEXT.md).
 */
interface VerificationRecord {
  contract: string
  txHash: string
  chainId: string
  network: string
  rpcUrl?: string
  solcVersion: string
  optimizer: SolcOptimizerSettings
  viaIR?: boolean
  evmVersion?: string
  sourceFile: string
  sourceHash: string
  license: string
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(resolve(PACKAGE_ROOT, relativePath), 'utf8')) as T
}

/** Extracts the SPDX license identifier from Solidity source. */
function extractSpdxLicense(source: string): string {
  const match = /SPDX-License-Identifier:\s*([A-Za-z0-9.\-+]+)/.exec(source)
  if (match === null) {
    throw new Error('No SPDX license identifier found in the contract source')
  }
  return match[1]
}

async function main(): Promise<void> {
  const networkName = hre.globalOptions.network
  if (networkName === 'hardhat') {
    console.error(
      'Refusing to deploy to the in-memory "hardhat" network: the deployment would vanish.\n' +
        'Start a local node (`hardhat node`) or point at a public RPC, then run with --network deploy.\n' +
        'See docs/deploy.md.'
    )
    process.exitCode = 1
    return
  }

  const connection = await hre.network.getOrCreate(networkName)
  const provider = new BrowserProvider(connection.provider, undefined, { cacheTimeout: -1 })
  const { chainId } = await provider.getNetwork()
  const signer = await provider.getSigner(0)
  const signerAddress = await signer.getAddress()

  // Everything a verifier needs comes from the compiled artifacts: the
  // build-info records the exact solc version and settings used, and the
  // artifact pins the bytecode that was compiled.
  const artifact = readJson<ArtifactJson>(ARTIFACT_PATH)
  if (artifact.buildInfoId === undefined) {
    throw new Error(`Artifact at ${ARTIFACT_PATH} has no buildInfoId; run \`pnpm build\` first`)
  }
  const buildInfo = readJson<BuildInfo>(`artifacts/build-info/${artifact.buildInfoId}.json`)
  const source = readFileSync(resolve(PACKAGE_ROOT, SOURCE_PATH), 'utf8')

  const sourceHash = keccak256(toUtf8Bytes(source))
  const license = extractSpdxLicense(source)
  const rpcUrl = 'url' in connection.networkConfig ? await connection.networkConfig.url.get() : undefined

  console.log(`Deploying EthereumDIDRegistry to network "${networkName}" (chainId ${chainId}) from ${signerAddress}`)
  console.log('RPC:', rpcUrl ?? 'unknown')

  const factory = new EthereumDIDRegistry__factory(signer)
  const contract = await (await factory.deploy()).waitForDeployment()
  const contractAddress = await contract.getAddress()
  const txHash = contract.deploymentTransaction()?.hash ?? '0x'

  // Integrity check: the code recorded on-chain must be exactly the artifact's
  // deployed bytecode (the contract has no constructor, so no runtime init code).
  const deployedCode = await provider.getCode(contractAddress)
  const bytecodeMatches = deployedCode === artifact.deployedBytecode

  const record: VerificationRecord = {
    contract: contractAddress,
    txHash,
    chainId: chainId.toString(),
    network: networkName,
    rpcUrl,
    solcVersion: buildInfo.solcLongVersion,
    optimizer: buildInfo.input.settings.optimizer ?? { enabled: false },
    viaIR: buildInfo.input.settings.viaIR,
    evmVersion: buildInfo.input.settings.evmVersion,
    sourceFile: SOURCE_PATH,
    sourceHash,
    license,
  }

  const line = (label: string, value: string): string => `  ${label.padEnd(14)}${value}`
  const rule = '='.repeat(80)
  console.log()
  console.log(rule)
  console.log('  DEPLOYMENT VERIFICATION RECORD')
  console.log(rule)
  console.log(line('contract', record.contract))
  console.log(line('tx hash', record.txHash))
  console.log(line('chainId', record.chainId))
  console.log(line('network', record.network))
  if (record.rpcUrl !== undefined) {
    console.log(line('rpc url', record.rpcUrl))
  }
  console.log(line('solc', record.solcVersion))
  const optimizer =
    record.optimizer.enabled && record.optimizer.runs !== undefined
      ? `enabled (runs: ${record.optimizer.runs})`
      : record.optimizer.enabled
        ? 'enabled'
        : 'disabled'
  console.log(line('optimizer', optimizer))
  if (record.viaIR !== undefined) {
    console.log(line('viaIR', String(record.viaIR)))
  }
  if (record.evmVersion !== undefined) {
    console.log(line('evmVersion', record.evmVersion))
  }
  console.log(line('source', record.sourceFile))
  console.log(line('source hash', record.sourceHash))
  console.log(line('license', record.license))
  console.log(line('bytecode', bytecodeMatches ? 'on-chain code matches artifact' : 'MISMATCH — verify manually!'))
  console.log(rule)
  console.log()
  console.log('Machine-readable record (paste into the resolver PR):')
  console.log(JSON.stringify(record, null, 2))
  console.log()
  console.log(
    'Hand-off: open a PR against packages/ethr-did-resolver/src/config/deployments.ts adding\n' +
      `{ chainId: ${record.chainId}, registry: '${record.contract}', name: '...' } — deployments\n` +
      'are owned by the resolver package; the registry package never writes that file.'
  )
}

main().catch((error: unknown) => {
  console.error('Deployment failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})

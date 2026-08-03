// scripts/deploy-testnet.ts
// One-time pre-deployment of the 7 delegation managers to a testnet (Sepolia or
// Gnosis). The ERC-1056 registry is already deployed there, so only the managers
// are deployed. Writes the resulting addresses into webapp/src/config/deployed.json
// so the static GitHub Pages app can run testnet mode without any server.
//
// Usage:
//   DEPLOYER_KEY=0x... pnpm tsx scripts/deploy-testnet.ts sepolia
//   DEPLOYER_KEY=0x... pnpm tsx scripts/deploy-testnet.ts gnosis
//
// The deployer must hold ETH/xDAI for gas on the target network.

import { writeFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia as sepoliaChain, gnosis as gnosisChain, type Chain } from 'viem/chains'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Mirrors webapp/src/lib/deploy.ts imports so the artifacts stay the source of truth.
import DIDManagerArtifact from '../artifacts/DIDManager7702.json'
import PolicyDIDManagerArtifact from '../artifacts/PolicyDIDManager7702.json'
import MultiSigDIDManagerArtifact from '../artifacts/MultiSigDIDManager7702.json'
import RevocationDIDManagerArtifact from '../artifacts/RevocationDIDManager7702.json'
import CrossChainDIDManagerArtifact from '../artifacts/CrossChainDIDManager7702.json'
import MetaTxDIDManagerArtifact from '../artifacts/MetaTxDIDManager7702.json'
import ExpiringDIDManagerArtifact from '../artifacts/ExpiringDIDManager7702.json'

const NETWORKS: Record<string, { chain: Chain; rpcUrl: string; label: string }> = {
  sepolia: {
    chain: sepoliaChain,
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    label: 'Sepolia',
  },
  gnosis: {
    chain: gnosisChain,
    rpcUrl: 'https://gnosis-rpc.publicnode.com',
    label: 'Gnosis',
  },
}

async function main() {
  const target = process.argv[2]
  if (!target || !NETWORKS[target]) {
    console.error('Usage: pnpm tsx scripts/deploy-testnet.ts <sepolia|gnosis>')
    process.exit(1)
  }

  const privateKey = process.env.DEPLOYER_KEY as `0x${string}` | undefined
  if (!privateKey) {
    console.error('DEPLOYER_KEY env var is required (private key of a funded account).')
    process.exit(1)
  }

  const { chain, rpcUrl, label } = NETWORKS[target]
  const account = privateKeyToAccount(privateKey)

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) })
  const walletClient = createWalletClient({ chain, transport: http(rpcUrl), account })

  const balance = await publicClient.getBalance({ address: account.address })
  console.log(`[${label}] deployer ${account.address} balance: ${balance.toString()} wei`)
  if (balance === 0n) {
    console.error(`[${label}] deployer has no funds — aborting.`)
    process.exit(1)
  }

  const artifacts = [
    ['didManager', DIDManagerArtifact],
    ['policyDidManager', PolicyDIDManagerArtifact],
    ['multiSigDidManager', MultiSigDIDManagerArtifact],
    ['revocationDidManager', RevocationDIDManagerArtifact],
    ['crossChainDidManager', CrossChainDIDManagerArtifact],
    ['metaTxDidManager', MetaTxDIDManagerArtifact],
    ['expiringDidManager', ExpiringDIDManagerArtifact],
  ] as const

  const result: Record<string, string> = {}
  for (const [name, artifact] of artifacts) {
    console.log(`[${label}] deploying ${name}...`)
    const hash = await walletClient.deployContract({
      abi: (artifact as { abi: unknown[] }).abi as never,
      bytecode: (artifact as { bytecode: string }).bytecode as `0x${string}`,
      chain,
      account,
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (!receipt.contractAddress) throw new Error(`${name} deployment failed`)
    result[name] = receipt.contractAddress
    console.log(`[${label}]   ${name} → ${receipt.contractAddress} (${hash})`)
  }

  // Merge into deployed.json (keep the other network's entries).
  const deployedPath = join(__dirname, '..', 'webapp', 'src', 'config', 'deployed.json')
  const existing = JSON.parse(await import('node:fs/promises').then((m) => m.readFile(deployedPath, 'utf-8')))
  existing[target] = result
  writeFileSync(deployedPath, JSON.stringify(existing, null, 2) + '\n')

  console.log(`\n[${label}] Wrote ${target} addresses to webapp/src/config/deployed.json`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

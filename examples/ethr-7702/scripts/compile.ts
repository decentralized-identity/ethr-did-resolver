// scripts/compile.ts
// Compile Solidity contracts using solc-js (npm package solc@0.8.28)
// Output: artifacts/<ContractName>.json containing { abi, bytecode }
// Usage: pnpm tsx scripts/compile.ts

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { join, basename } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const solc = require('solc')

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const contractsDir = join(__dirname, '..', 'contracts')
const artifactsDir = join(__dirname, '..', 'artifacts')

mkdirSync(artifactsDir, { recursive: true })

const solFiles = readdirSync(contractsDir).filter((f) => f.endsWith('.sol'))

if (solFiles.length === 0) {
  console.log('No .sol files found in contracts/')
  process.exit(0)
}

for (const solFile of solFiles) {
  const contractName = basename(solFile, '.sol')
  const source = readFileSync(join(contractsDir, solFile), 'utf-8')

  const input = {
    language: 'Solidity',
    sources: {
      [solFile]: { content: source },
    },
    settings: {
      evmVersion: 'prague',
      outputSelection: {
        '*': { '*': ['abi', 'evm.bytecode.object'] },
      },
      optimizer: { enabled: true, runs: 200 },
    },
  }

  const outputRaw = solc.compile(JSON.stringify(input))
  const output = JSON.parse(outputRaw)

  const errors = (output.errors ?? []).filter((e: { severity: string }) => e.severity === 'error')
  if (errors.length > 0) {
    console.error(`Compilation errors in ${solFile}:`)
    for (const err of errors) console.error(err.formattedMessage)
    process.exit(1)
  }

  const contract = output.contracts[solFile][contractName]
  if (!contract) {
    console.error(`Contract ${contractName} not found in ${solFile}`)
    process.exit(1)
  }

  const artifact = {
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
  }

  const outPath = join(artifactsDir, `${contractName}.json`)
  writeFileSync(outPath, JSON.stringify(artifact, null, 2))
  console.log(`Compiled ${solFile} → artifacts/${contractName}.json`)
}

console.log('Done.')

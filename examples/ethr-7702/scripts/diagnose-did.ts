// scripts/diagnose-did.ts
//
// One-shot on-chain diagnostic for "my DID update didn't show up". Point it at a
// network + DID identity (and optionally the broadcast tx hash) and it reports
// - expected vs actual delegation code on the identity EOA
// - the tx (status, block, to, selector) and revert reason if it reverted
// - the registry's last-change block + matching registry events for the identity
// - the full resolved did:ethr document (same reader the webapp uses)
//
// Usage:
//   pnpm tsx scripts/diagnose-did.ts sepolia 0x<identity>                     # read-only
//   pnpm tsx scripts/diagnose-did.ts sepolia 0x<identity> 0x<txHash>          # + inspect a tx
//   pnpm tsx scripts/diagnose-did.ts sepolia 0x<identity> <txHash> <rpcUrl>   # custom RPC (fork etc.)

import { createPublicClient, http, decodeFunctionData, defineChain } from 'viem'
import { Resolver } from 'did-resolver'
import { getResolver, EthereumDIDRegistry } from 'ethr-did-resolver'
import { NETWORKS } from '../webapp/src/config/chains.js'
import { deterministicManagerAddresses } from '../webapp/src/lib/deploy.js'
import { CREATE2_FACTORY, isDeployed } from '../webapp/src/lib/create2.js'
import { DID_MANAGER_ABI } from '../src/utils/abis.js'

const CHAINID: Record<string, number> = { sepolia: 11155111, gnosis: 100 }
const CURRENCY: Record<string, { name: string; symbol: string; decimals: number }> = {
  sepolia: { name: 'Sepolia Ether', symbol: 'SEP', decimals: 18 },
  gnosis: { name: 'xDai', symbol: 'xDAI', decimals: 18 },
}

async function main() {
  const [, , netArg = 'sepolia', identityArg, txHashArg, rpcOverride] = process.argv
  const net = netArg as 'sepolia' | 'gnosis'
  const cfg = NETWORKS[net]
  if (!cfg) throw new Error(`network must be sepolia|gnosis (got "${net}")`)
  if (!identityArg) throw new Error('usage: diagnose-did.ts <sepolia|gnosis> <identity> [txHash] [rpcUrl]')
  const identity = identityArg.toLowerCase() as `0x${string}`
  const rpcUrl = rpcOverride ?? cfg.resolverRpcUrl
  const chain = defineChain({
    id: CHAINID[net],
    name: net,
    nativeCurrency: CURRENCY[net],
    rpcUrls: { default: { http: [rpcUrl] } },
  })

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) })
  const registry = cfg.registry!
  const managers = deterministicManagerAddresses()
  const expectedManager = managers.didManager

  console.log(`network=${net}  identity=${identity}`)
  console.log(`rpc=${rpcUrl}`)
  console.log(`registry=${registry}`)
  console.log(`expected DIDManager=${managers.didManager}`)
  console.log(`numberOfManagersDefined=${Object.keys(managers).length}`)

  // 1. Identity delegation code
  const code = await publicClient.getCode({ address: identity })
  let delegateLabel: string
  if (!code || code === '0x') {
    delegateLabel = 'NONE (plain EOA)'
  } else if (code.toLowerCase().startsWith('0xef0100')) {
    const delegate = (`0x${code.slice(8).toLowerCase()}`) as `0x${string}`
    const match = Object.entries(managers).find(([, a]) => a.toLowerCase() === delegate.toLowerCase())
    delegateLabel = `delegates to ${delegate}${match ? ` == ${match[0]} (matches expected)` : '  <<< NOT a known manager!'}`
  } else {
    delegateLabel = `has ${code.length / 2 - 1} bytes of NON-7702 code (address may be a contract, not an EOA!)`
  }
  console.log(`\n1) EOA delegation code: ${delegateLabel}`)
  const expectedFactory = await isDeployed(publicClient, CREATE2_FACTORY).catch(() => false)
  console.log(`   CREATE2 factory deployed: ${expectedFactory}`)

  // 2. Tx inspection (optional)
  if (txHashArg) {
    const txHash = txHashArg as `0x${string}`
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash }).catch((e) => ({ error: e.shortMessage ?? String(e) }))
    if ('error' in receipt) {
      console.log(`\n2) tx ${txHash}: NOT FOUND — ${(receipt as { error: string }).error}`)
    } else {
      console.log(`\n2) tx ${txHash}:`)
      const tx = await publicClient.getTransaction({ hash: txHash }).catch(() => null)
      console.log(`   status=${receipt.status}  block=${receipt.blockNumber}  from=${receipt.from}`)
      console.log(`   to=${receipt.to}`)
      if (tx && tx.input && tx.input !== '0x') {
        try {
          const d = decodeFunctionData({ abi: DID_MANAGER_ABI, data: tx.input })
          console.log(`   calldata -> ${d.functionName}(${JSON.stringify(d.args)?.slice(0, 200)})`)
        } catch {
          console.log(`   calldata selector=${tx.input.slice(0, 10)} (not a DIDManager func)`)
        }
      }
      if (receipt.status === 'reverted') {
        // debug_traceTransaction is not in viem's public RPC method union
        const trace = await (publicClient as unknown as { debugTraceTransaction: (a: object) => Promise<{ revertReason?: string } | null> })
          .debugTraceTransaction({ hash: txHash, traceType: 'revert' })
          .catch(() => null)
        console.log(`   REVERT reason: ${trace?.revertReason ?? 'see provider reverted details (use --trace)'}`)
      }
    }
  }

  // 3. Registry state for the identity
  const ethrAbi = EthereumDIDRegistry.abi
  const lastChange = await publicClient.readContract({ address: registry, abi: ethrAbi, functionName: 'changed', args: [identity] }).catch((e) => `ERR ${e.shortMessage ?? e.message}`)
  console.log(`\n3) registry.changed(identity) = ${String(lastChange)} (0 → never changed)`)

  // Recent registry events for the identity (last ~200k blocks, ~a few days)
  const latestBlock = await publicClient.getBlockNumber()
  const fromBlock = latestBlock - 200000n
  try {
    const logs = await publicClient.getLogs({ address: registry, fromBlock, toBlock: 'latest' })
    const mine = logs.filter((l) => {
      const id = (l as { topics: string[] }).topics?.[1]?.toLowerCase()
      return id === ('0x000000000000000000000000' + identity.slice(2)).toLowerCase()
    })
    console.log(`   DID events for identity in last ~200k blocks: ${mine.length}`)
    for (const l of mine) {
      console.log(`     block=${l.blockNumber} sig=${(l as { topics: string[] }).topics[0].slice(0, 10)}`)
    }
  } catch (e) {
    console.log(`   getLogs over last 200k blocks failed: ${(e as { shortMessage?: string }).shortMessage ?? e}`)
  }

  // 4. Resolution (exact webapp reader)
  console.log('\n4) resolution:')
  const resolver = new Resolver(getResolver({ networks: [{ name: cfg.didNetworkName, chainId: CHAINID[net], rpcUrl, registry }] }))
  const result = await resolver.resolve(`did:ethr:${cfg.didNetworkName}:${identity}`)
  if (result.didResolutionMetadata.error) {
    console.log(`   ERROR: ${result.didResolutionMetadata.error}`)
    console.log(`   message: ${JSON.stringify(result.didResolutionMetadata)}`)
  } else {
    const vm = (result.didDocument?.verificationMethod ?? []) as Array<{ id: string }>
    console.log(`   ok — ${vm.length} verification method(s):`)
    for (const v of vm) console.log(`     - ${v.id}`)
    console.log(`   full doc: ${JSON.stringify(result.didDocument, null, 2)}`)
  }
}

main().catch((e) => { console.error('FATAL:', e?.shortMessage ?? e); process.exit(1) })
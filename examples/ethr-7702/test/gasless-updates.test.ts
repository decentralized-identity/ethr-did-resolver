// test/gasless-updates.test.ts
// Pattern 2: Gasless DID update — EOA signs 7702 auth, sponsor pays gas and sends tx.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { Resolver } from 'did-resolver'
import { getResolver, stringToBytes32 } from 'ethr-did-resolver'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { anvil as anvilChain } from 'viem/chains'
import { TEST_ENV_FILE } from './globalSetup.js'
import { getAnvilAccounts, getAnvilPrivateKeys } from '../src/utils/anvil.js'
import { gaslessDidUpdate } from '../src/patterns/gasless-updates.js'

type TestEnv = {
  rpcUrl: string
  chainId: number
  contracts: { registry: `0x${string}`; didManager: `0x${string}` }
}

function loadEnv(): TestEnv {
  return JSON.parse(readFileSync(TEST_ENV_FILE, 'utf-8'))
}

describe('Pattern 2: Gasless/Sponsored 7702 DID Update', () => {
  it('sponsor pays gas; EOA DID document is updated without EOA spending ETH', async () => {
    const { rpcUrl, chainId, contracts } = loadEnv()

    // EOA: account[5] — signs the auth but does NOT send the tx
    const eoaPrivateKey = getAnvilPrivateKeys()[5]
    const eoaAccount = privateKeyToAccount(eoaPrivateKey)
    const eoaAddress = getAnvilAccounts()[5]

    // Sponsor: account[6] — pays gas and broadcasts the tx
    const sponsorPrivateKey = getAnvilPrivateKeys()[6]
    const sponsorAccount = privateKeyToAccount(sponsorPrivateKey)

    const publicClient = createPublicClient({
      chain: anvilChain,
      transport: http(rpcUrl),
    })

    const eoaWalletClient = createWalletClient({
      chain: anvilChain,
      transport: http(rpcUrl),
      account: eoaAccount,
    })

    const sponsorWalletClient = createWalletClient({
      chain: anvilChain,
      transport: http(rpcUrl),
      account: sponsorAccount,
    })

    // Record EOA's ETH balance before — it must not decrease
    const eoaBalanceBefore = await publicClient.getBalance({ address: eoaAddress })

    const attrName = stringToBytes32('did/pub/Ed25519/veriKey/base64') as `0x${string}`
    // 'gaslesskeydata' → base64 = 'Z2FzbGVzc2tleWRhdGE='
    const attrValue = new TextEncoder().encode('gaslesskeydata')
    const validity = 86400n

    const txHash = await gaslessDidUpdate(eoaWalletClient, sponsorWalletClient, publicClient, {
      registry: contracts.registry,
      didManagerAddress: contracts.didManager,
      attrName,
      attrValue,
      validity,
    })

    expect(txHash).toMatch(/^0x[0-9a-f]{64}$/i)

    // EOA balance must be unchanged — sponsor paid the gas
    const eoaBalanceAfter = await publicClient.getBalance({ address: eoaAddress })
    expect(eoaBalanceAfter).toBe(eoaBalanceBefore)

    // --- Resolve and verify DID document was updated ---
    const resolver = new Resolver(
      getResolver({
        networks: [{ name: 'dev', chainId, rpcUrl, registry: contracts.registry }],
      })
    )

    const did = `did:ethr:dev:${eoaAddress}`
    const result = await resolver.resolve(did)

    expect(result.didResolutionMetadata.error).toBeUndefined()

    const doc = result.didDocument!
    expect(doc.verificationMethod).toHaveLength(2) // #controller + new Ed25519 key

    const newKey = doc.verificationMethod!.find((vm) => vm.id.endsWith('#delegate-1'))
    expect(newKey).toBeDefined()
    expect(newKey!.type).toBe('Ed25519VerificationKey2020')
    expect((newKey as { publicKeyMultibase?: string }).publicKeyMultibase).toBe('zWGTL7VcmkDHeY1WWiegfrg')

    expect(doc.assertionMethod).toContain(`${did}#delegate-1`)

    // --- 7702 delegation code is set on the EOA ---
    const code = await publicClient.getCode({ address: eoaAddress })
    const expectedCode = `0xef0100${contracts.didManager.slice(2).toLowerCase()}`
    expect(code?.toLowerCase()).toBe(expectedCode)
  })
})

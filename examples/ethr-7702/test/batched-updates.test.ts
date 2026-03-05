// test/batched-updates.test.ts
// Pattern 1: Batched DID attribute updates — one 7702 auth, one tx, N attributes set atomically.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { Resolver } from 'did-resolver'
import { getResolver, stringToBytes32 } from 'ethr-did-resolver'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { anvil as anvilChain } from 'viem/chains'
import { TEST_ENV_FILE } from './globalSetup.js'
import { getAnvilAccounts, getAnvilPrivateKeys } from '../src/utils/anvil.js'
import { batchedDidUpdates } from '../src/patterns/batched-updates.js'

type TestEnv = {
  rpcUrl: string
  chainId: number
  contracts: { registry: `0x${string}`; didManager: `0x${string}` }
}

function loadEnv(): TestEnv {
  return JSON.parse(readFileSync(TEST_ENV_FILE, 'utf-8'))
}

describe('Pattern 1: Batched 7702 DID Updates', () => {
  it('sets multiple DID attributes atomically in one type-4 tx', async () => {
    const { rpcUrl, chainId, contracts } = loadEnv()

    // Use account[4] to avoid collision with other tests
    const privateKey = getAnvilPrivateKeys()[4]
    const account = privateKeyToAccount(privateKey)
    const eoaAddress = getAnvilAccounts()[4]

    const publicClient = createPublicClient({
      chain: anvilChain,
      transport: http(rpcUrl),
    })

    const walletClient = createWalletClient({
      chain: anvilChain,
      transport: http(rpcUrl),
      account,
    })

    // Two different key types set in one transaction
    const updates = [
      {
        name: stringToBytes32('did/pub/Ed25519/veriKey/base64') as `0x${string}`,
        value: new TextEncoder().encode('ed25519pubkey'),
        validity: 86400n,
      },
      {
        name: stringToBytes32('did/pub/Secp256k1/veriKey/base64') as `0x${string}`,
        value: new TextEncoder().encode('secp256k1pubkey'),
        validity: 86400n,
      },
    ]

    const txHash = await batchedDidUpdates(walletClient, publicClient, {
      registry: contracts.registry,
      didManagerAddress: contracts.didManager,
      updates,
    })

    expect(txHash).toMatch(/^0x[0-9a-f]{64}$/i)

    // --- Resolve and verify both attributes appear in the DID document ---
    const resolver = new Resolver(
      getResolver({
        networks: [{ name: 'dev', chainId, rpcUrl, registry: contracts.registry }],
      })
    )

    const did = `did:ethr:dev:${eoaAddress}`
    const result = await resolver.resolve(did)

    expect(result.didResolutionMetadata.error).toBeUndefined()

    const doc = result.didDocument!
    // Default #controller + two new keys = 3 entries
    expect(doc.verificationMethod).toHaveLength(3)

    // Ed25519 key (#delegate-1)
    const ed25519Key = doc.verificationMethod!.find((vm) => vm.id.endsWith('#delegate-1'))
    expect(ed25519Key).toBeDefined()
    expect(ed25519Key!.type).toBe('Ed25519VerificationKey2018')
    // 'ed25519pubkey' → base64 = 'ZWQyNTUxOXB1YmtleQ=='
    expect((ed25519Key as { publicKeyBase64?: string }).publicKeyBase64).toBe('ZWQyNTUxOXB1YmtleQ==')

    // Secp256k1 key (#delegate-2)
    const secpKey = doc.verificationMethod!.find((vm) => vm.id.endsWith('#delegate-2'))
    expect(secpKey).toBeDefined()
    expect(secpKey!.type).toBe('EcdsaSecp256k1VerificationKey2019')
    // 'secp256k1pubkey' → base64 = 'c2VjcDI1NmsxcHVia2V5'
    expect((secpKey as { publicKeyBase64?: string }).publicKeyBase64).toBe('c2VjcDI1NmsxcHVia2V5')

    // Both should appear in assertionMethod
    expect(doc.assertionMethod).toContain(`${did}#delegate-1`)
    expect(doc.assertionMethod).toContain(`${did}#delegate-2`)

    // --- Verify delegation code is set ---
    const code = await publicClient.getCode({ address: eoaAddress })
    const expectedCode = `0xef0100${contracts.didManager.slice(2).toLowerCase()}`
    expect(code?.toLowerCase()).toBe(expectedCode)
  })
})

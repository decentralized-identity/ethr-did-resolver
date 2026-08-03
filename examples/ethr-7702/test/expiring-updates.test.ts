// test/expiring-updates.test.ts
// Pattern 10: Expiring delegation via EIP-7702.
// EOA delegates to ExpiringDIDManager7702 and configures an app-level expiry
// fully gaslessly: EOA signs the 7702 auth + an EIP-712 Configure intent
// off-chain; a broadcaster relays configureBySig and pays the gas.
// Writes before expiry succeed; writes after expiry revert.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { Resolver } from 'did-resolver'
import { getResolver, stringToBytes32 } from 'ethr-did-resolver'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { anvil as anvilChain } from 'viem/chains'
import { TEST_ENV_FILE } from './globalSetup.js'
import { getAnvilPrivateKeys } from '../src/utils/anvil.js'
import {
  configureExpiringBySig,
  expiringSetAttribute,
} from '../src/patterns/expiring.js'

type TestEnv = {
  rpcUrl: string
  chainId: number
  contracts: {
    registry: `0x${string}`
    expiringDidManager: `0x${string}`
    [key: string]: `0x${string}`
  }
}

function loadEnv(): TestEnv {
  return JSON.parse(readFileSync(TEST_ENV_FILE, 'utf-8'))
}

describe('Pattern 10: Expiring 7702 DID Updates', () => {
  it('EOA configures expiry via BySig relay and pays zero gas', async () => {
    const { rpcUrl, chainId, contracts } = loadEnv()

    const keys = getAnvilPrivateKeys()
    // EOA: account[4] — never sends a tx in this test
    const eoaAccount = privateKeyToAccount(keys[4])
    const eoaAddress = eoaAccount.address
    // Broadcaster: account[0] — pays all gas
    const broadcasterWallet = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: privateKeyToAccount(keys[0]) })

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })

    const balanceBefore = await publicClient.getBalance({ address: eoaAddress })

    // Step 1 (gasless): EOA signs 7702 auth + Configure intent; broadcaster relays
    const expiry = BigInt(Math.floor(Date.now() / 1000)) + 86400n // 24h
    const configHash = await configureExpiringBySig(eoaWalletClient, broadcasterWallet, publicClient, {
      expiringDidManagerAddress: contracts.expiringDidManager,
      expiry,
    })
    expect(configHash).toMatch(/^0x[0-9a-f]{64}$/i)

    // EOA paid zero gas — balance must be unchanged
    const balanceAfterConfig = await publicClient.getBalance({ address: eoaAddress })
    expect(balanceAfterConfig).toBe(balanceBefore)

    // Step 2: broadcaster writes a DID attribute before expiry
    const attrName = stringToBytes32('did/pub/Ed25519/veriKey/base64') as `0x${string}`
    const writeHash = await expiringSetAttribute(broadcasterWallet, publicClient, {
      registry: contracts.registry,
      eoaAddress,
      attrName,
      attrValue: new TextEncoder().encode('expiringkey'),
      validity: 86400n,
    })
    expect(writeHash).toMatch(/^0x[0-9a-f]{64}$/i)
    expect(await publicClient.getBalance({ address: eoaAddress })).toBe(balanceBefore)

    // Verify DID document reflects the write
    const resolver = new Resolver(
      getResolver({ networks: [{ name: 'dev', chainId, rpcUrl, registry: contracts.registry }] })
    )
    const did = `did:ethr:dev:${eoaAddress}`
    const result = await resolver.resolve(did)
    expect(result.didResolutionMetadata.error).toBeUndefined()
    const doc = result.didDocument!
    expect(doc.verificationMethod).toHaveLength(2)
    const newKey = doc.verificationMethod!.find((vm) => vm.id.endsWith('#delegate-1'))
    expect(newKey).toBeDefined()
    expect((newKey as { publicKeyMultibase?: string }).publicKeyMultibase).toBe('zLjxdu6EiZsBbQrgSJL')
  })

  it('writes revert once the configured expiry has passed', async () => {
    const { rpcUrl, contracts } = loadEnv()

    const keys = getAnvilPrivateKeys()
    const eoaAccount = privateKeyToAccount(keys[4])
    const eoaAddress = eoaAccount.address
    const broadcasterWallet = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: privateKeyToAccount(keys[0]) })

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })

    // Configure an expiry in the past so the delegation is already expired
    const currentTs = (await publicClient.getBlock()).timestamp
    await configureExpiringBySig(eoaWalletClient, broadcasterWallet, publicClient, {
      expiringDidManagerAddress: contracts.expiringDidManager,
      expiry: currentTs - 1n,
    })

    const attrName = stringToBytes32('did/pub/Ed25519/veriKey/base64') as `0x${string}`
    await expect(
      expiringSetAttribute(broadcasterWallet, publicClient, {
        registry: contracts.registry,
        eoaAddress,
        attrName,
        attrValue: new TextEncoder().encode('toosoon'),
        validity: 3600n,
      })
    ).rejects.toThrow(/expired|reverted/)
  })
})

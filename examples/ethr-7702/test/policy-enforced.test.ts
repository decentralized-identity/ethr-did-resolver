// test/policy-enforced.test.ts
// Pattern 3: Policy-enforced DID updates.
// EOA delegates to PolicyDIDManager7702, registers a session key with:
//   - allowed prefix: "did/pub/" (only did/pub/* attributes permitted)
//   - max validity: 3600s
// Session key then updates the DID document. Policy violations are rejected.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { Resolver } from 'did-resolver'
import { getResolver, stringToBytes32 } from 'ethr-did-resolver'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { anvil as anvilChain } from 'viem/chains'
import { TEST_ENV_FILE } from './globalSetup.js'
import { getAnvilAccounts, getAnvilPrivateKeys } from '../src/utils/anvil.js'
import {
  configurePolicyDelegation,
  sessionKeyDidUpdate,
} from '../src/patterns/policy-enforced.js'

type TestEnv = {
  rpcUrl: string
  chainId: number
  contracts: { registry: `0x${string}`; didManager: `0x${string}`; policyDidManager: `0x${string}` }
}

function loadEnv(): TestEnv {
  return JSON.parse(readFileSync(TEST_ENV_FILE, 'utf-8'))
}

// "did/pub/" as bytes32 (right-padded with zeros)
const DID_PUB_PREFIX = '0x6469642f7075622f000000000000000000000000000000000000000000000000' as `0x${string}`
const MAX_VALIDITY = 3600n // 1 hour

describe('Pattern 3: Policy-Enforced 7702 DID Updates', () => {
  it('session key can update DID attributes within policy constraints', async () => {
    const { rpcUrl, chainId, contracts } = loadEnv()

    // EOA: account[7]
    const eoaPrivateKey = getAnvilPrivateKeys()[7]
    const eoaAccount = privateKeyToAccount(eoaPrivateKey)
    const eoaAddress = eoaAccount.address

    // Session key: account[8]
    const sessionKeyPrivateKey = getAnvilPrivateKeys()[8]
    const sessionKeyAccount = privateKeyToAccount(sessionKeyPrivateKey)
    const sessionKeyAddress = sessionKeyAccount.address

    const publicClient = createPublicClient({
      chain: anvilChain,
      transport: http(rpcUrl),
    })

    const eoaWalletClient = createWalletClient({
      chain: anvilChain,
      transport: http(rpcUrl),
      account: eoaAccount,
    })

    const sessionKeyWalletClient = createWalletClient({
      chain: anvilChain,
      transport: http(rpcUrl),
      account: sessionKeyAccount,
    })

    // Step 1+2: EOA delegates to PolicyDIDManager7702 and registers session key
    const configHash = await configurePolicyDelegation(eoaWalletClient, publicClient, {
      policyDidManagerAddress: contracts.policyDidManager,
      sessionKey: sessionKeyAddress,
      maxValidity: MAX_VALIDITY,
      allowedPrefix: DID_PUB_PREFIX,
    })
    expect(configHash).toMatch(/^0x[0-9a-f]{64}$/i)

    // Step 3: Session key updates a DID attribute
    const attrName = stringToBytes32('did/pub/Ed25519/veriKey/base64') as `0x${string}`
    // 'sessionkeydata' → base64 = 'c2Vzc2lvbmtleWRhdGE='
    const attrValue = new TextEncoder().encode('sessionkeydata')
    const validity = 1800n // 30 min — within the 1hr cap

    const updateHash = await sessionKeyDidUpdate(sessionKeyWalletClient, publicClient, {
      registry: contracts.registry,
      policyDidManagerAddress: contracts.policyDidManager,
      eoaAddress,
      attrName,
      attrValue,
      validity,
    })
    expect(updateHash).toMatch(/^0x[0-9a-f]{64}$/i)

    // --- Verify DID document was updated ---
    const resolver = new Resolver(
      getResolver({
        networks: [{ name: 'dev', chainId, rpcUrl, registry: contracts.registry }],
      })
    )

    const did = `did:ethr:dev:${eoaAddress}`
    const result = await resolver.resolve(did)

    expect(result.didResolutionMetadata.error).toBeUndefined()

    const doc = result.didDocument!
    expect(doc.verificationMethod).toHaveLength(2)

    const newKey = doc.verificationMethod!.find((vm) => vm.id.endsWith('#delegate-1'))
    expect(newKey).toBeDefined()
    expect(newKey!.type).toBe('Ed25519VerificationKey2020')
    expect((newKey as { publicKeyMultibase?: string }).publicKeyMultibase).toBe('zWGTQXhbENdze6tCkNncfnp')

    expect(doc.assertionMethod).toContain(`${did}#delegate-1`)
  })

  it('session key cannot exceed max validity cap', async () => {
    const { rpcUrl, contracts } = loadEnv()

    // EOA: account[9]
    const eoaPrivateKey = getAnvilPrivateKeys()[9]
    const eoaAccount = privateKeyToAccount(eoaPrivateKey)
    const eoaAddress = eoaAccount.address

    // Session key: account[8] (reuse)
    const sessionKeyPrivateKey = getAnvilPrivateKeys()[8]
    const sessionKeyAccount = privateKeyToAccount(sessionKeyPrivateKey)
    const sessionKeyAddress = sessionKeyAccount.address

    const publicClient = createPublicClient({
      chain: anvilChain,
      transport: http(rpcUrl),
    })

    const eoaWalletClient = createWalletClient({
      chain: anvilChain,
      transport: http(rpcUrl),
      account: eoaAccount,
    })

    const sessionKeyWalletClient = createWalletClient({
      chain: anvilChain,
      transport: http(rpcUrl),
      account: sessionKeyAccount,
    })

    // Configure policy with 1hr max validity
    await configurePolicyDelegation(eoaWalletClient, publicClient, {
      policyDidManagerAddress: contracts.policyDidManager,
      sessionKey: sessionKeyAddress,
      maxValidity: MAX_VALIDITY,
      allowedPrefix: DID_PUB_PREFIX,
    })

    // Attempt update with validity > cap — should revert
    const attrName = stringToBytes32('did/pub/Ed25519/veriKey/base64') as `0x${string}`

    await expect(
      sessionKeyDidUpdate(sessionKeyWalletClient, publicClient, {
        registry: contracts.registry,
        policyDidManagerAddress: contracts.policyDidManager,
        eoaAddress,
        attrName,
        attrValue: new TextEncoder().encode('test'),
        validity: MAX_VALIDITY + 1n, // exceeds cap
      })
    ).rejects.toThrow()
  })

  it('session key cannot set attributes outside allowed prefix', async () => {
    const { rpcUrl, contracts } = loadEnv()

    // EOA: account[9] — configure fresh since each test reverts state
    const eoaPrivateKey = getAnvilPrivateKeys()[9]
    const eoaAccount = privateKeyToAccount(eoaPrivateKey)
    const eoaAddress = eoaAccount.address

    const sessionKeyPrivateKey = getAnvilPrivateKeys()[8]
    const sessionKeyAccount = privateKeyToAccount(sessionKeyPrivateKey)
    const sessionKeyAddress = sessionKeyAccount.address

    const publicClient = createPublicClient({
      chain: anvilChain,
      transport: http(rpcUrl),
    })

    const eoaWalletClient = createWalletClient({
      chain: anvilChain,
      transport: http(rpcUrl),
      account: eoaAccount,
    })

    const sessionKeyWalletClient = createWalletClient({
      chain: anvilChain,
      transport: http(rpcUrl),
      account: sessionKeyAccount,
    })

    // Configure policy: only did/pub/* allowed
    await configurePolicyDelegation(eoaWalletClient, publicClient, {
      policyDidManagerAddress: contracts.policyDidManager,
      sessionKey: sessionKeyAddress,
      maxValidity: MAX_VALIDITY,
      allowedPrefix: DID_PUB_PREFIX,
    })

    // "did/svc/" prefix — not allowed
    const disallowedAttrName = stringToBytes32('did/svc/HubService') as `0x${string}`

    await expect(
      sessionKeyDidUpdate(sessionKeyWalletClient, publicClient, {
        registry: contracts.registry,
        policyDidManagerAddress: contracts.policyDidManager,
        eoaAddress,
        attrName: disallowedAttrName,
        attrValue: new TextEncoder().encode('https://example.com'),
        validity: 1800n,
      })
    ).rejects.toThrow()
  })
})

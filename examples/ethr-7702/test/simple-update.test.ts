// test/simple-update.test.ts
// Pattern 0: Simplest possible 7702 DID update — EOA delegates to DIDManager7702,
// calls setAttributeForIdentity, DID document reflects the change.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { Resolver } from 'did-resolver'
import { getResolver, stringToBytes32 } from 'ethr-did-resolver'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { anvil as anvilChain } from 'viem/chains'
import { TEST_ENV_FILE } from './globalSetup.js'
import { getAnvilAccounts, getAnvilPrivateKeys } from '../src/utils/anvil.js'
import { simpleDidUpdate } from '../src/patterns/simple-update.js'

type TestEnv = {
  rpcUrl: string
  chainId: number
  contracts: { registry: `0x${string}`; didManager: `0x${string}` }
}

function loadEnv(): TestEnv {
  return JSON.parse(readFileSync(TEST_ENV_FILE, 'utf-8'))
}

describe('Pattern 0: Simple 7702 DID Update', () => {
  it('EOA can update its DID document via 7702 delegation to DIDManager7702', async () => {
    const { rpcUrl, chainId, contracts } = loadEnv()

    // Use account[3] to avoid collision with infrastructure tests
    const privateKey = getAnvilPrivateKeys()[3]
    const account = privateKeyToAccount(privateKey)
    const eoaAddress = getAnvilAccounts()[3]

    const publicClient = createPublicClient({
      chain: anvilChain,
      transport: http(rpcUrl),
    })

    const walletClient = createWalletClient({
      chain: anvilChain,
      transport: http(rpcUrl),
      account,
    })

    // Broadcaster pays the gas; here a dedicated Anvil dev key.
    const broadcasterWallet = createWalletClient({
      chain: anvilChain,
      transport: http(rpcUrl),
      account: privateKeyToAccount(getAnvilPrivateKeys()[0]), // broadcaster pays gas
    })

    const attrName = stringToBytes32('did/pub/Ed25519/veriKey/base64') as `0x${string}`
    // The resolver v14 encodes the raw bytes as publicKeyMultibase
    // (base58btc of 0xed01 || bytes). 'base64encodedpubkey' → zFaHNPrHzCnSudUfDV1Vfo1hkkrR4t
    const attrValue = new TextEncoder().encode('base64encodedpubkey')
    const validity = 86400n // 1 day

    const txHash = await simpleDidUpdate(walletClient, broadcasterWallet, publicClient, {
      registry: contracts.registry,
      didManagerAddress: contracts.didManager,
      attrName,
      attrValue,
      validity,
    })

    expect(txHash).toMatch(/^0x[0-9a-f]{64}$/i)

    // --- Verify the DID document reflects the update ---
    const resolver = new Resolver(
      getResolver({
        networks: [{ name: 'dev', chainId, rpcUrl, registry: contracts.registry }],
      })
    )

    const did = `did:ethr:dev:${eoaAddress}`
    const result = await resolver.resolve(did)

    expect(result.didResolutionMetadata.error).toBeUndefined()

    const doc = result.didDocument!
    // Two entries: the default #controller + the newly added Ed25519 key
    expect(doc.verificationMethod).toHaveLength(2)

    // The new entry should be the Ed25519 key we set
    const newKey = doc.verificationMethod!.find((vm) => vm.id.endsWith('#delegate-1'))
    expect(newKey).toBeDefined()
    expect(newKey!.type).toBe('Ed25519VerificationKey2020')
    expect(newKey!.controller).toBe(did)
    // ethr-did-resolver v14 emits the raw value as publicKeyMultibase
    // (base58btc of 0xed01 || bytes) per the Multikey spec
    expect((newKey as { publicKeyMultibase?: string }).publicKeyMultibase).toBe('zFaHNPrHzCnSudUfDV1Vfo1hkkrR4t')

    // The key should appear in assertionMethod (veriKey delegate type)
    expect(doc.assertionMethod).toContain(`${did}#delegate-1`)
    // It is NOT in authentication (that would require sigAuth delegate type)
    expect(doc.authentication).not.toContain(`${did}#delegate-1`)

    // --- Verify the 7702 delegation indicator is set on the EOA ---
    // getCode returns 0xef0100<20-byte-implementation-address> for delegated EOAs
    const code = await publicClient.getCode({ address: eoaAddress })
    const expectedCode = `0xef0100${contracts.didManager.slice(2).toLowerCase()}`
    expect(code?.toLowerCase()).toBe(expectedCode)
  })
})

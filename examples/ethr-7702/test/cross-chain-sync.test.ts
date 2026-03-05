// test/cross-chain-sync.test.ts
// Pattern 7: Cross-chain DID sync via EIP-7702.
//
// Demonstrates the full off-chain flow:
//   - EOA signs an EIP-7702 authorization tuple (no tx, no ETH needed on Chain B)
//   - EOA signs an EIP-712 UpdateAuthorization (no tx)
//   - Relayer bundles both into ONE type-4 tx: sets delegation + calls setAttributeCrossChain
//
// For subsequent updates the delegation is already set; relayer just calls setAttributeCrossChain.

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
  signCrossChainAuthorization,
  signCrossChainUpdate,
  relayerSubmitUpdate,
} from '../src/patterns/cross-chain-sync.js'

type TestEnv = {
  rpcUrl: string
  chainId: number
  contracts: {
    registry: `0x${string}`
    crossChainDidManager: `0x${string}`
    [key: string]: `0x${string}`
  }
}

function loadEnv(): TestEnv {
  return JSON.parse(readFileSync(TEST_ENV_FILE, 'utf-8'))
}

describe('Pattern 7: Cross-Chain DID Sync', () => {
  it('relayer bundles delegation + update in one tx — EOA spends no gas', async () => {
    const { rpcUrl, chainId, contracts } = loadEnv()

    const keys = getAnvilPrivateKeys()
    // EOA: account[1] — imagine it has no ETH on Chain B
    const eoaAccount = privateKeyToAccount(keys[1])
    const eoaAddress = eoaAccount.address
    // Relayer: account[0] — pays all gas
    const relayerAccount = privateKeyToAccount(keys[0])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const relayerWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: relayerAccount })

    // Step 1 (off-chain): EOA signs EIP-7702 auth tuple — no tx sent
    // relayerAddress is passed so viem does not offset EOA nonce (relayer pays gas)
    const authorization = await signCrossChainAuthorization(eoaWalletClient, {
      crossChainDidManagerAddress: contracts.crossChainDidManager,
      relayerAddress: relayerAccount.address,
    })

    // Step 2 (off-chain): EOA signs EIP-712 update authorization — no tx sent
    const attrName = stringToBytes32('did/pub/Ed25519/veriKey/base64') as `0x${string}`
    const attrValue = new TextEncoder().encode('crosschainkey')
    const validity = 3600n
    const nonce = 0n

    const signature = await signCrossChainUpdate(eoaWalletClient, {
      eoaAddress,
      registry: contracts.registry,
      attrName,
      attrValue,
      validity,
      nonce,
      chainId,
    })

    expect(signature).toMatch(/^0x[0-9a-f]{130}$/i) // 65 bytes = 130 hex chars

    // Step 3: Relayer submits ONE tx: sets delegation + calls setAttributeCrossChain atomically
    await relayerSubmitUpdate(relayerWalletClient, publicClient, {
      registry: contracts.registry,
      eoaAddress,
      attrName,
      attrValue,
      validity,
      signature,
      authorization, // delegation set here — EOA never sends a tx
    })

    // Verify DID document on Chain B
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
    expect(newKey!.type).toBe('Ed25519VerificationKey2018')
    // 'crosschainkey' base64 = 'Y3Jvc3NjaGFpbmtleQ=='
    expect((newKey as { publicKeyBase64?: string }).publicKeyBase64).toBe('Y3Jvc3NjaGFpbmtleQ==')
    expect(doc.assertionMethod).toContain(`${did}#delegate-1`)
  })

  it('rejects replayed signature (nonce already used)', async () => {
    const { rpcUrl, chainId, contracts } = loadEnv()

    const keys = getAnvilPrivateKeys()
    const eoaAccount = privateKeyToAccount(keys[1])
    const eoaAddress = eoaAccount.address
    const relayerAccount = privateKeyToAccount(keys[0])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const relayerWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: relayerAccount })

    const attrName = stringToBytes32('did/pub/Ed25519/veriKey/base64') as `0x${string}`
    const attrValue = new TextEncoder().encode('replaytest')
    const validity = 3600n

    // EOA signs auth + update for nonce=0
    const authorization = await signCrossChainAuthorization(eoaWalletClient, {
      crossChainDidManagerAddress: contracts.crossChainDidManager,
      relayerAddress: relayerAccount.address,
    })
    const sig = await signCrossChainUpdate(eoaWalletClient, {
      eoaAddress, registry: contracts.registry,
      attrName, attrValue, validity, nonce: 0n, chainId,
    })

    // First submission: delegation set + update at nonce=0 — succeeds
    await relayerSubmitUpdate(relayerWalletClient, publicClient, {
      registry: contracts.registry, eoaAddress, attrName, attrValue, validity,
      signature: sig, authorization,
    })

    // Second submission of the same signature — contract nonce is now 1, should revert
    await expect(
      relayerSubmitUpdate(relayerWalletClient, publicClient, {
        registry: contracts.registry, eoaAddress, attrName, attrValue, validity,
        signature: sig, // same sig signed with nonce=0, but contract nonce is now 1
      })
    ).rejects.toThrow()
  })

  it('rejects signature with wrong chain ID', async () => {
    const { rpcUrl, contracts, chainId } = loadEnv()

    const keys = getAnvilPrivateKeys()
    const eoaAccount = privateKeyToAccount(keys[1])
    const eoaAddress = eoaAccount.address
    const relayerAccount = privateKeyToAccount(keys[0])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const relayerWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: relayerAccount })

    const attrName = stringToBytes32('did/pub/Ed25519/veriKey/base64') as `0x${string}`
    const attrValue = new TextEncoder().encode('wrongchain')
    const validity = 3600n

    // EOA signs auth (valid)
    const authorization = await signCrossChainAuthorization(eoaWalletClient, {
      crossChainDidManagerAddress: contracts.crossChainDidManager,
      relayerAddress: relayerAccount.address,
    })

    // EOA signs update with a WRONG chainId — contract will reject (domain mismatch)
    const wrongChainSig = await signCrossChainUpdate(eoaWalletClient, {
      eoaAddress, registry: contracts.registry,
      attrName, attrValue, validity, nonce: 0n,
      chainId: chainId + 1, // wrong chain
    })

    await expect(
      relayerSubmitUpdate(relayerWalletClient, publicClient, {
        registry: contracts.registry, eoaAddress, attrName, attrValue, validity,
        signature: wrongChainSig, authorization,
      })
    ).rejects.toThrow()
  })
})

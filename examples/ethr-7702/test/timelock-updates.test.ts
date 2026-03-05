// test/timelock-updates.test.ts
// Pattern 5: Time-locked DID key rotation via EIP-7702.
// EOA delegates to TimelockDIDManager7702 with a 60s delay.
// A proposed attribute update can only execute after the delay elapses.
// Proposals can be cancelled before execution.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { Resolver } from 'did-resolver'
import { getResolver, stringToBytes32 } from 'ethr-did-resolver'
import { createPublicClient, createWalletClient, createTestClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { anvil as anvilChain } from 'viem/chains'
import { TEST_ENV_FILE } from './globalSetup.js'
import { getAnvilPrivateKeys, ANVIL_RPC_URL } from '../src/utils/anvil.js'
import {
  configureTimelockDelegation,
  proposeDidUpdate,
  executeDidUpdate,
  cancelDidUpdate,
} from '../src/patterns/timelock-updates.js'

type TestEnv = {
  rpcUrl: string
  chainId: number
  contracts: {
    registry: `0x${string}`
    timelockDidManager: `0x${string}`
    [key: string]: `0x${string}`
  }
}

function loadEnv(): TestEnv {
  return JSON.parse(readFileSync(TEST_ENV_FILE, 'utf-8'))
}

const DELAY = 60n // 60 seconds

describe('Pattern 5: Time-Locked 7702 DID Updates', () => {
  it('executes DID update after delay elapses', async () => {
    const { rpcUrl, chainId, contracts } = loadEnv()

    const keys = getAnvilPrivateKeys()
    const eoaAccount = privateKeyToAccount(keys[3])
    const eoaAddress = eoaAccount.address

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const testClient = createTestClient({ mode: 'anvil', chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })

    // Step 1: configure delegation with 60s delay
    await configureTimelockDelegation(eoaWalletClient, publicClient, {
      timelockDidManagerAddress: contracts.timelockDidManager,
      delay: DELAY,
    })

    // Step 2: propose a DID attribute update
    const attrName = stringToBytes32('did/pub/Ed25519/veriKey/base64') as `0x${string}`
    const attrValue = new TextEncoder().encode('timelockrotatedkey')
    const validity = 3600n

    const { proposalId } = await proposeDidUpdate(eoaWalletClient, publicClient, {
      registry: contracts.registry,
      timelockDidManagerAddress: contracts.timelockDidManager,
      attrName,
      attrValue,
      validity,
    })
    expect(proposalId).toMatch(/^0x[0-9a-f]{64}$/i)

    // Step 3: attempt execution before delay — should revert
    await expect(
      executeDidUpdate(eoaWalletClient, publicClient, {
        timelockDidManagerAddress: contracts.timelockDidManager,
        eoaAddress,
        proposalId,
      })
    ).rejects.toThrow()

    // Advance time past the delay
    await testClient.increaseTime({ seconds: Number(DELAY) + 1 })
    await testClient.mine({ blocks: 1 })

    // Step 4: execute — should now succeed
    await executeDidUpdate(eoaWalletClient, publicClient, {
      timelockDidManagerAddress: contracts.timelockDidManager,
      eoaAddress,
      proposalId,
    })

    // Verify DID document updated
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
    // 'timelockrotatedkey' base64 = 'dGltZWxvY2tyb3RhdGVka2V5'
    expect((newKey as { publicKeyBase64?: string }).publicKeyBase64).toBe('dGltZWxvY2tyb3RhdGVka2V5')
    expect(doc.assertionMethod).toContain(`${did}#delegate-1`)
  })

  it('cannot execute before delay elapses', async () => {
    const { rpcUrl, contracts } = loadEnv()

    const keys = getAnvilPrivateKeys()
    const eoaAccount = privateKeyToAccount(keys[4])
    const eoaAddress = eoaAccount.address

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })

    await configureTimelockDelegation(eoaWalletClient, publicClient, {
      timelockDidManagerAddress: contracts.timelockDidManager,
      delay: DELAY,
    })

    const attrName = stringToBytes32('did/pub/Ed25519/veriKey/base64') as `0x${string}`
    const { proposalId } = await proposeDidUpdate(eoaWalletClient, publicClient, {
      registry: contracts.registry,
      timelockDidManagerAddress: contracts.timelockDidManager,
      attrName,
      attrValue: new TextEncoder().encode('test'),
      validity: 3600n,
    })

    // No time advance — execute immediately should revert
    await expect(
      executeDidUpdate(eoaWalletClient, publicClient, {
        timelockDidManagerAddress: contracts.timelockDidManager,
        eoaAddress,
        proposalId,
      })
    ).rejects.toThrow()
  })

  it('cancelled proposal cannot be executed', async () => {
    const { rpcUrl, contracts } = loadEnv()

    const keys = getAnvilPrivateKeys()
    const eoaAccount = privateKeyToAccount(keys[4])
    const eoaAddress = eoaAccount.address

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const testClient = createTestClient({ mode: 'anvil', chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })

    await configureTimelockDelegation(eoaWalletClient, publicClient, {
      timelockDidManagerAddress: contracts.timelockDidManager,
      delay: DELAY,
    })

    const attrName = stringToBytes32('did/pub/Ed25519/veriKey/base64') as `0x${string}`
    const { proposalId } = await proposeDidUpdate(eoaWalletClient, publicClient, {
      registry: contracts.registry,
      timelockDidManagerAddress: contracts.timelockDidManager,
      attrName,
      attrValue: new TextEncoder().encode('test'),
      validity: 3600n,
    })

    // Cancel the proposal
    await cancelDidUpdate(eoaWalletClient, publicClient, {
      eoaAddress,
      proposalId,
    })

    // Advance time past the delay
    await testClient.increaseTime({ seconds: Number(DELAY) + 1 })
    await testClient.mine({ blocks: 1 })

    // Execute should revert even after delay — proposal is cancelled
    await expect(
      executeDidUpdate(eoaWalletClient, publicClient, {
        timelockDidManagerAddress: contracts.timelockDidManager,
        eoaAddress,
        proposalId,
      })
    ).rejects.toThrow()
  })
})

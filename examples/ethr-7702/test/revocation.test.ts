// test/revocation.test.ts
// Pattern 6: Revocation registry integration via EIP-7702.
// EOA delegates to RevocationDIDManager7702.
// Tests: attribute revocation via ERC-1056 + credential-level revocation in EOA storage.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { Resolver } from 'did-resolver'
import { getResolver, stringToBytes32 } from 'ethr-did-resolver'
import { createPublicClient, createWalletClient, http, encodeFunctionData } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { anvil as anvilChain } from 'viem/chains'
import { TEST_ENV_FILE } from './globalSetup.js'
import { getAnvilPrivateKeys } from '../src/utils/anvil.js'
import {
  setupRevocationDelegation,
  revokeAttribute,
  revokeCredential,
  checkIsRevoked,
  credentialIdFromString,
} from '../src/patterns/revocation.js'
import { REVOCATION_DID_MANAGER_ABI } from '../src/utils/abis.js'

type TestEnv = {
  rpcUrl: string
  chainId: number
  contracts: {
    registry: `0x${string}`
    revocationDidManager: `0x${string}`
    [key: string]: `0x${string}`
  }
}

function loadEnv(): TestEnv {
  return JSON.parse(readFileSync(TEST_ENV_FILE, 'utf-8'))
}

describe('Pattern 6: Revocation Registry Integration', () => {
  it('ERC-1056 attribute revocation removes key from DID document', async () => {
    const { rpcUrl, chainId, contracts } = loadEnv()

    const keys = getAnvilPrivateKeys()
    const eoaAccount = privateKeyToAccount(keys[2])
    const eoaAddress = eoaAccount.address

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const broadcasterWallet = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: privateKeyToAccount(keys[0]) })

    const attrName = stringToBytes32('did/pub/Ed25519/veriKey/base64') as `0x${string}`
    const attrValue = new TextEncoder().encode('revocablepubkey')
    const validity = 3600n

    // Step 1+2: delegate and add attribute in one tx
    await setupRevocationDelegation(eoaWalletClient, broadcasterWallet, publicClient, {
      revocationDidManagerAddress: contracts.revocationDidManager,
      registry: contracts.registry,
      attrName,
      attrValue,
      validity,
    })

    // Verify attribute is present
    const resolver = new Resolver(
      getResolver({ networks: [{ name: 'dev', chainId, rpcUrl, registry: contracts.registry }] })
    )
    const did = `did:ethr:dev:${eoaAddress}`

    const beforeResult = await resolver.resolve(did)
    expect(beforeResult.didDocument!.verificationMethod).toHaveLength(2)

    // Step 3: revoke the attribute via ERC-1056
    await revokeAttribute(eoaWalletClient, broadcasterWallet, publicClient, {
      registry: contracts.registry,
      attrName,
      attrValue,
    })

    // After revocation — key should no longer appear (validTo=0 means expired)
    const afterResult = await resolver.resolve(did)
    expect(afterResult.didResolutionMetadata.error).toBeUndefined()
    // The revoked key has validTo=0, so it is excluded from the resolved document
    const methods = afterResult.didDocument!.verificationMethod ?? []
    const revokedKey = methods.find((vm) => vm.id.endsWith('#delegate-1'))
    expect(revokedKey).toBeUndefined()
  })

  it('credential revocation records flag in EOA storage', async () => {
    const { rpcUrl, contracts } = loadEnv()

    const keys = getAnvilPrivateKeys()
    const eoaAccount = privateKeyToAccount(keys[2])
    const eoaAddress = eoaAccount.address

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const broadcasterWallet = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: privateKeyToAccount(keys[0]) })

    const attrName = stringToBytes32('did/pub/Ed25519/veriKey/base64') as `0x${string}`
    // Delegate + add an attribute to establish delegation
    await setupRevocationDelegation(eoaWalletClient, broadcasterWallet, publicClient, {
      revocationDidManagerAddress: contracts.revocationDidManager,
      registry: contracts.registry,
      attrName,
      attrValue: new TextEncoder().encode('setupkey'),
      validity: 3600n,
    })

    const credentialId = credentialIdFromString('vc:example:credential-123')

    // Should not be revoked yet
    const beforeRevoke = await checkIsRevoked(publicClient, { eoaAddress, credentialId })
    expect(beforeRevoke).toBe(false)

    // Revoke the credential
    await revokeCredential(eoaWalletClient, broadcasterWallet, publicClient, { credentialId })

    // Now should be revoked
    const afterRevoke = await checkIsRevoked(publicClient, { eoaAddress, credentialId })
    expect(afterRevoke).toBe(true)

    // Different credentialId is not affected
    const otherId = credentialIdFromString('vc:example:credential-456')
    const otherRevoked = await checkIsRevoked(publicClient, { eoaAddress, credentialId: otherId })
    expect(otherRevoked).toBe(false)
  })

  it('only EOA owner can revoke credentials', async () => {
    const { rpcUrl, contracts } = loadEnv()

    const keys = getAnvilPrivateKeys()
    const eoaAccount = privateKeyToAccount(keys[2])
    const eoaAddress = eoaAccount.address
    const attackerAccount = privateKeyToAccount(keys[9])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const attackerWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: attackerAccount })
    const broadcasterWallet = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: privateKeyToAccount(keys[0]) })

    const attrName = stringToBytes32('did/pub/Ed25519/veriKey/base64') as `0x${string}`
    // EOA delegates and establishes delegation
    await setupRevocationDelegation(eoaWalletClient, broadcasterWallet, publicClient, {
      revocationDidManagerAddress: contracts.revocationDidManager,
      registry: contracts.registry,
      attrName,
      attrValue: new TextEncoder().encode('setupkey'),
      validity: 3600n,
    })

    const credentialId = credentialIdFromString('vc:example:credential-789')

    // Attacker tries to revoke a credential on the EOA's behalf
    const data = encodeFunctionData({
      abi: REVOCATION_DID_MANAGER_ABI,
      functionName: 'revokeCredential',
      args: [credentialId],
    })

    const hash = await attackerWalletClient.sendTransaction({
      to: eoaAddress, data, gas: 100_000n,
      chain: attackerWalletClient.chain, account: attackerWalletClient.account!,
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    // Transaction should revert — attacker is not address(this)
    expect(receipt.status).toBe('reverted')

    // Credential still not revoked
    const stillNotRevoked = await checkIsRevoked(publicClient, { eoaAddress, credentialId })
    expect(stillNotRevoked).toBe(false)
  })
})

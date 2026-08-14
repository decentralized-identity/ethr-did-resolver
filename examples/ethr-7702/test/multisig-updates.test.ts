// test/multisig-updates.test.ts
// Pattern 4: Multi-sig DID updates via EIP-7702.
// EOA delegates to MultiSigDIDManager7702, configures a 2-of-3 signer set.
// A DID attribute update requires signatures from 2 of the 3 co-signers.
// Submitting fewer than threshold signatures, or forged signatures, is rejected.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { Resolver } from 'did-resolver'
import { getResolver, stringToBytes32 } from 'ethr-did-resolver'
import {
  createPublicClient,
  createWalletClient,
  http,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { anvil as anvilChain } from 'viem/chains'
import { TEST_ENV_FILE } from './globalSetup.js'
import { getAnvilPrivateKeys } from '../src/utils/anvil.js'
import {
  configureMultiSigDelegation,
  getUpdateDigest,
  multiSigDidUpdate,
} from '../src/patterns/multisig-updates.js'
import { MULTISIG_DID_MANAGER_ABI } from '../src/utils/abis.js'

type TestEnv = {
  rpcUrl: string
  chainId: number
  contracts: {
    registry: `0x${string}`
    didManager: `0x${string}`
    policyDidManager: `0x${string}`
    multiSigDidManager: `0x${string}`
  }
}

function loadEnv(): TestEnv {
  return JSON.parse(readFileSync(TEST_ENV_FILE, 'utf-8'))
}

/**
 * Sign a raw 32-byte digest with the given account (no additional prefix).
 * The contract's _updateDigest() already applies \x19Ethereum Signed Message:\n32
 * internally, so ecrecover expects the final pre-assembled digest. We use
 * account.sign({ hash }) to avoid viem adding a second prefix.
 */
async function signDigest(account: ReturnType<typeof privateKeyToAccount>, digest: `0x${string}`): Promise<`0x${string}`> {
  return account.sign({ hash: digest })
}


/** Read the current multi-sig nonce for the EOA via the delegated manager. */
async function currentNonce(
  publicClient: ReturnType<typeof createPublicClient>,
  eoaAddress: `0x${string}`
): Promise<bigint> {
  return publicClient.readContract({
    address: eoaAddress,
    abi: MULTISIG_DID_MANAGER_ABI,
    functionName: 'nonce',
  })
}

describe('Pattern 4: Multi-Sig 7702 DID Updates', () => {
  it('2-of-3 multi-sig updates DID attribute when threshold met', async () => {
    const { rpcUrl, chainId, contracts } = loadEnv()

    const keys = getAnvilPrivateKeys()
    // EOA that will be the DID subject — use account[5]
    const eoaAccount = privateKeyToAccount(keys[5])
    const eoaAddress = eoaAccount.address

    // 3 co-signers: accounts[6], [7], [8] — sort ascending for ordering requirement
    const signerAccounts = [
      privateKeyToAccount(keys[6]),
      privateKeyToAccount(keys[7]),
      privateKeyToAccount(keys[8]),
    ].sort((a, b) => a.address.toLowerCase().localeCompare(b.address.toLowerCase()))

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })

    const eoaWalletClient = createWalletClient({
      chain: anvilChain, transport: http(rpcUrl), account: eoaAccount,
    })

    const broadcasterWallet = createWalletClient({
      chain: anvilChain, transport: http(rpcUrl), account: privateKeyToAccount(keys[0]),
    })

    // Step 1+2: configure 2-of-3 multi-sig delegation
    await configureMultiSigDelegation(eoaWalletClient, broadcasterWallet, publicClient, {
      multiSigDidManagerAddress: contracts.multiSigDidManager,
      signers: signerAccounts.map((a) => a.address),
      threshold: 2n,
    })

    // Step 3: get digest and collect 2-of-3 signatures (signers[0] and signers[1])
    const attrName = stringToBytes32('did/pub/Ed25519/veriKey/base64') as `0x${string}`
    const attrValue = new TextEncoder().encode('multisigkeydata')
    const validity = 3600n

    const digest = await getUpdateDigest(publicClient, {
      eoaAddress,
      registry: contracts.registry,
      attrName,
      attrValue,
      validity,
      nonce: await currentNonce(publicClient, eoaAddress),
    })

    // Collect sigs from signers[0] and signers[1] — accounts already sorted ascending
    const sig0 = await signDigest(signerAccounts[0], digest)
    const sig1 = await signDigest(signerAccounts[1], digest)

    // Ensure the two sigs are in ascending address order (they should be since accounts are sorted)
    const addr0 = signerAccounts[0].address.toLowerCase()
    const addr1 = signerAccounts[1].address.toLowerCase()
    const [orderedSig0, orderedSig1] = addr0 < addr1 ? [sig0, sig1] : [sig1, sig0]

    // Step 4: any submitter broadcasts (use the broadcaster here)
    await multiSigDidUpdate(broadcasterWallet, publicClient, {
      registry: contracts.registry,
      multiSigDidManagerAddress: contracts.multiSigDidManager,
      eoaAddress,
      attrName,
      attrValue,
      validity,
      signatures: [orderedSig0, orderedSig1],
    })

    // Verify DID document
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
    expect(newKey!.type).toBe('Ed25519VerificationKey2020')
    expect((newKey as { publicKeyMultibase?: string }).publicKeyMultibase).toBe('z3EBDPDgxjJveUWLsLVd5EEKr')
    expect(doc.assertionMethod).toContain(`${did}#delegate-1`)
  })

  it('rejects update with fewer than threshold signatures', async () => {
    const { rpcUrl, contracts } = loadEnv()

    const keys = getAnvilPrivateKeys()
    const eoaAccount = privateKeyToAccount(keys[5])
    const eoaAddress = eoaAccount.address

    const signerAccounts = [
      privateKeyToAccount(keys[6]),
      privateKeyToAccount(keys[7]),
      privateKeyToAccount(keys[8]),
    ].sort((a, b) => a.address.toLowerCase().localeCompare(b.address.toLowerCase()))

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const broadcasterWallet = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: privateKeyToAccount(keys[0]) })

    await configureMultiSigDelegation(eoaWalletClient, broadcasterWallet, publicClient, {
      multiSigDidManagerAddress: contracts.multiSigDidManager,
      signers: signerAccounts.map((a) => a.address),
      threshold: 2n,
    })

    const attrName = stringToBytes32('did/pub/Ed25519/veriKey/base64') as `0x${string}`
    const attrValue = new TextEncoder().encode('test')
    const validity = 3600n

    const digest = await getUpdateDigest(publicClient, {
      eoaAddress, registry: contracts.registry, attrName, attrValue, validity, nonce: await currentNonce(publicClient, eoaAddress),
    })

    const sig = await signDigest(signerAccounts[0], digest)

    // Submit only 1 signature for a 2-of-3 threshold — should revert
    await expect(
      multiSigDidUpdate(broadcasterWallet, publicClient, {
        registry: contracts.registry,
        multiSigDidManagerAddress: contracts.multiSigDidManager,
        eoaAddress,
        attrName,
        attrValue,
        validity,
        signatures: [sig], // only 1 of 2 required
      })
    ).rejects.toThrow()
  })

  it('rejects update with non-signer signature', async () => {
    const { rpcUrl, contracts } = loadEnv()

    const keys = getAnvilPrivateKeys()
    const eoaAccount = privateKeyToAccount(keys[5])
    const eoaAddress = eoaAccount.address

    const signerAccounts = [
      privateKeyToAccount(keys[6]),
      privateKeyToAccount(keys[7]),
    ].sort((a, b) => a.address.toLowerCase().localeCompare(b.address.toLowerCase()))

    // account[9] is NOT in the signer set
    const outsiderAccount = privateKeyToAccount(keys[9])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const broadcasterWallet = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: privateKeyToAccount(keys[0]) })

    await configureMultiSigDelegation(eoaWalletClient, broadcasterWallet, publicClient, {
      multiSigDidManagerAddress: contracts.multiSigDidManager,
      signers: signerAccounts.map((a) => a.address),
      threshold: 2n,
    })

    const attrName = stringToBytes32('did/pub/Ed25519/veriKey/base64') as `0x${string}`
    const attrValue = new TextEncoder().encode('test')
    const validity = 3600n

    const digest = await getUpdateDigest(publicClient, {
      eoaAddress, registry: contracts.registry, attrName, attrValue, validity, nonce: await currentNonce(publicClient, eoaAddress),
    })

    const sig0 = await signDigest(signerAccounts[0], digest)
    const sigOutsider = await signDigest(outsiderAccount, digest)

    // Sort the two sigs by their recovered addresses (signer0 and outsider)
    const addr0 = signerAccounts[0].address.toLowerCase()
    const addrOut = outsiderAccount.address.toLowerCase()
    const [firstSig, secondSig] = addr0 < addrOut ? [sig0, sigOutsider] : [sigOutsider, sig0]

    // 1 valid signer + 1 outsider — threshold is 2 but outsider doesn't count
    await expect(
      multiSigDidUpdate(broadcasterWallet, publicClient, {
        registry: contracts.registry,
        multiSigDidManagerAddress: contracts.multiSigDidManager,
        eoaAddress,
        attrName,
        attrValue,
        validity,
        signatures: [firstSig, secondSig],
      })
    ).rejects.toThrow()
  })
})

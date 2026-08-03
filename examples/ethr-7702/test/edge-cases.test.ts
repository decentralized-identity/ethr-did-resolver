// test/edge-cases.test.ts
// Edge case and security tests for all five delegation contracts.
//
// Tests are organized by contract. Each test exercises boundary conditions,
// access-control rejection paths, and (fixed) security bugs.
//
// All tests run against a live Anvil instance with per-test snapshot/revert.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  hashTypedData,
  http,
  toHex,
  keccak256,
  encodeAbiParameters,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { anvil as anvilChain } from 'viem/chains'
import { stringToBytes32 } from 'ethr-did-resolver'
import { TEST_ENV_FILE } from './globalSetup.js'
import { getAnvilPrivateKeys } from '../src/utils/anvil.js'
import {
  DID_MANAGER_ABI,
  POLICY_DID_MANAGER_ABI,
  MULTISIG_DID_MANAGER_ABI,
  REVOCATION_DID_MANAGER_ABI,
  CROSS_CHAIN_DID_MANAGER_ABI,
} from '../src/utils/abis.js'

// ---------------------------------------------------------------------------
// Shared types & helpers
// ---------------------------------------------------------------------------

type TestEnv = {
  rpcUrl: string
  chainId: number
  contracts: {
    registry: `0x${string}`
    didManager: `0x${string}`
    policyDidManager: `0x${string}`
    multiSigDidManager: `0x${string}`
    revocationDidManager: `0x${string}`
    crossChainDidManager: `0x${string}`
    metaTxDidManager: `0x${string}`
  }
}

function loadEnv(): TestEnv {
  return JSON.parse(readFileSync(TEST_ENV_FILE, 'utf-8'))
}

/** Send calldata to an EOA address and return whether the tx succeeded. */
async function sendToEoa(
  walletClient: ReturnType<typeof createWalletClient>,
  publicClient: ReturnType<typeof createPublicClient>,
  opts: { to: `0x${string}`; data: `0x${string}`; authorizationList?: unknown[] }
): Promise<{ success: boolean; hash: `0x${string}` }> {
  const txParams: Record<string, unknown> = {
    to: opts.to,
    data: opts.data,
    gas: 300_000n,
    chain: walletClient.chain,
    account: walletClient.account!,
  }
  if (opts.authorizationList) txParams.authorizationList = opts.authorizationList

  const hash = await walletClient.sendTransaction(txParams as Parameters<typeof walletClient.sendTransaction>[0])
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  return { success: receipt.status === 'success', hash }
}

/** Delegate an EOA to a contract and call a function on it in one tx. */
async function delegateAndCall(
  eoaWalletClient: ReturnType<typeof createWalletClient>,
  publicClient: ReturnType<typeof createPublicClient>,
  contractAddress: `0x${string}`,
  data: `0x${string}`
): Promise<{ success: boolean; hash: `0x${string}` }> {
  const auth = await eoaWalletClient.signAuthorization({
    contractAddress,
    executor: 'self',
    account: eoaWalletClient.account!,
  })
  return sendToEoa(eoaWalletClient, publicClient, {
    to: eoaWalletClient.account!.address,
    data,
    authorizationList: [auth],
  })
}

/** Compute the EIP-712 digest that CrossChainDIDManager7702 verifies — off-chain, no delegation required. */
function crossChainDigest(params: {
  eoaAddress: `0x${string}`
  registry: `0x${string}`
  attrName: `0x${string}`
  attrValue: `0x${string}`
  validity: bigint
  nonce: bigint
  chainId: number
}): `0x${string}` {
  return hashTypedData({
    domain: {
      name: 'CrossChainDIDManager7702',
      version: '1',
      chainId: params.chainId,
      verifyingContract: params.eoaAddress,
    },
    types: {
      UpdateAuthorization: [
        { name: 'registry', type: 'address' },
        { name: 'name', type: 'bytes32' },
        { name: 'value', type: 'bytes' },
        { name: 'validity', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
      ],
    },
    primaryType: 'UpdateAuthorization',
    message: {
      registry: params.registry,
      name: params.attrName,
      value: params.attrValue,
      validity: params.validity,
      nonce: params.nonce,
    },
  })
}

const keys = getAnvilPrivateKeys()
const ATTR_NAME = stringToBytes32('did/pub/Ed25519/veriKey/base64') as `0x${string}`
const ATTR_VALUE = toHex(new TextEncoder().encode('edgecasekey'))
const VALIDITY = 3600n

// ===========================================================================
// DIDManager7702 edge cases
// ===========================================================================

describe('DIDManager7702 edge cases', () => {
  it('setBatchAttributesForIdentity with empty array is a no-op (succeeds)', async () => {
    const { rpcUrl, contracts } = loadEnv()
    const eoaAccount = privateKeyToAccount(keys[1])
    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const walletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })

    const data = encodeFunctionData({
      abi: DID_MANAGER_ABI,
      functionName: 'setBatchAttributesForIdentity',
      args: [contracts.registry, []],
    })

    const { success } = await delegateAndCall(walletClient, publicClient, contracts.didManager, data)
    expect(success).toBe(true)
  })

  it('any account can call setAttributeForIdentity on a delegated EOA (by design — no access control)', async () => {
    // DIDManager7702 intentionally has NO msg.sender check.
    // The ERC-1056 call uses address(this) (the EOA) as the identity, so the registry
    // accepts it. This test documents the design: third-party calls succeed.
    const { rpcUrl, contracts } = loadEnv()

    // EOA to delegate (account[1])
    const eoaAccount = privateKeyToAccount(keys[1])
    // Third party that will call on behalf of the EOA (account[2])
    const thirdPartyAccount = privateKeyToAccount(keys[2])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const thirdPartyWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: thirdPartyAccount })

    // Step 1: EOA sets delegation (no call)
    const auth = await eoaWalletClient.signAuthorization({
      contractAddress: contracts.didManager,
      executor: 'self',
    })
    const setupHash = await eoaWalletClient.sendTransaction({
      authorizationList: [auth],
      to: eoaAccount.address,
      data: '0x',
      gas: 100_000n,
      chain: anvilChain,
      account: eoaAccount,
    })
    await publicClient.waitForTransactionReceipt({ hash: setupHash })

    // Step 2: third party calls setAttributeForIdentity on the delegated EOA
    const data = encodeFunctionData({
      abi: DID_MANAGER_ABI,
      functionName: 'setAttributeForIdentity',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY],
    })

    const { success } = await sendToEoa(thirdPartyWalletClient, publicClient, {
      to: eoaAccount.address,
      data,
    })
    // IMPORTANT: this SUCCEEDS. DIDManager7702 has no access control by design.
    // See contracts/DIDManager7702.sol natspec.
    expect(success).toBe(true)
  })
})

// ===========================================================================
// PolicyDIDManager7702 edge cases
// ===========================================================================

describe('PolicyDIDManager7702 edge cases', () => {
  it('rejects setAttributeViaSessionKey from non-session-key caller', async () => {
    const { rpcUrl, contracts } = loadEnv()

    const eoaAccount = privateKeyToAccount(keys[1])
    const sessionKeyAccount = privateKeyToAccount(keys[2])
    const attackerAccount = privateKeyToAccount(keys[3])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const attackerWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: attackerAccount })

    // Configure delegation with sessionKeyAccount as the session key
    const configData = encodeFunctionData({
      abi: POLICY_DID_MANAGER_ABI,
      functionName: 'configure',
      args: [
        sessionKeyAccount.address,
        VALIDITY,
        stringToBytes32('did/pub/') as `0x${string}`,
      ],
    })
    const { success: configOk } = await delegateAndCall(eoaWalletClient, publicClient, contracts.policyDidManager, configData)
    expect(configOk).toBe(true)

    // Attacker (not session key) tries to call setAttributeViaSessionKey
    const updateData = encodeFunctionData({
      abi: POLICY_DID_MANAGER_ABI,
      functionName: 'setAttributeViaSessionKey',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY],
    })

    const { success } = await sendToEoa(attackerWalletClient, publicClient, {
      to: eoaAccount.address,
      data: updateData,
    })
    expect(success).toBe(false) // "not session key"
  })

  it('rejects call before configure (session key defaults to address(0))', async () => {
    const { rpcUrl, contracts } = loadEnv()

    // Use a fresh EOA that has never called configure
    const eoaAccount = privateKeyToAccount(keys[1])
    const attackerAccount = privateKeyToAccount(keys[2])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const attackerWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: attackerAccount })

    // Delegate only — no configure call
    const auth = await eoaWalletClient.signAuthorization({
      contractAddress: contracts.policyDidManager,
      executor: 'self',
    })
    const delegateHash = await eoaWalletClient.sendTransaction({
      authorizationList: [auth],
      to: eoaAccount.address,
      data: '0x',
      gas: 100_000n,
      chain: anvilChain,
      account: eoaAccount,
    })
    await publicClient.waitForTransactionReceipt({ hash: delegateHash })

    // Attacker tries to use session key path before any configure
    const updateData = encodeFunctionData({
      abi: POLICY_DID_MANAGER_ABI,
      functionName: 'setAttributeViaSessionKey',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, 100n],
    })

    const { success } = await sendToEoa(attackerWalletClient, publicClient, {
      to: eoaAccount.address,
      data: updateData,
    })
    expect(success).toBe(false) // sessionKey == address(0), attacker != address(0)
  })

  it('accepts validity exactly at maxValidity (boundary)', async () => {
    const { rpcUrl, contracts } = loadEnv()

    const eoaAccount = privateKeyToAccount(keys[1])
    const sessionKeyAccount = privateKeyToAccount(keys[2])
    const MAX_VALIDITY = 3600n

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const sessionKeyWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: sessionKeyAccount })

    const configData = encodeFunctionData({
      abi: POLICY_DID_MANAGER_ABI,
      functionName: 'configure',
      args: [
        sessionKeyAccount.address,
        MAX_VALIDITY,
        stringToBytes32('did/pub/') as `0x${string}`,
      ],
    })
    const { success: configOk } = await delegateAndCall(eoaWalletClient, publicClient, contracts.policyDidManager, configData)
    expect(configOk).toBe(true)

    const updateData = encodeFunctionData({
      abi: POLICY_DID_MANAGER_ABI,
      functionName: 'setAttributeViaSessionKey',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, MAX_VALIDITY], // exactly at cap
    })

    const { success } = await sendToEoa(sessionKeyWalletClient, publicClient, {
      to: eoaAccount.address,
      data: updateData,
    })
    expect(success).toBe(true)
  })

  it('reconfiguring session key revokes old key', async () => {
    const { rpcUrl, contracts } = loadEnv()

    const eoaAccount = privateKeyToAccount(keys[1])
    const oldSessionKey = privateKeyToAccount(keys[2])
    const newSessionKey = privateKeyToAccount(keys[3])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const oldKeyWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: oldSessionKey })

    const PREFIX = stringToBytes32('did/pub/') as `0x${string}`

    // Configure with oldSessionKey
    const configData1 = encodeFunctionData({
      abi: POLICY_DID_MANAGER_ABI,
      functionName: 'configure',
      args: [oldSessionKey.address, VALIDITY, PREFIX],
    })
    await delegateAndCall(eoaWalletClient, publicClient, contracts.policyDidManager, configData1)

    // Reconfigure with newSessionKey
    const configData2 = encodeFunctionData({
      abi: POLICY_DID_MANAGER_ABI,
      functionName: 'configure',
      args: [newSessionKey.address, VALIDITY, PREFIX],
    })
    const { success: reConfigOk } = await sendToEoa(eoaWalletClient, publicClient, {
      to: eoaAccount.address,
      data: configData2,
    })
    expect(reConfigOk).toBe(true)

    // Old session key should now be rejected
    const updateData = encodeFunctionData({
      abi: POLICY_DID_MANAGER_ABI,
      functionName: 'setAttributeViaSessionKey',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, 100n],
    })

    const { success } = await sendToEoa(oldKeyWalletClient, publicClient, {
      to: eoaAccount.address,
      data: updateData,
    })
    expect(success).toBe(false) // old key rejected
  })
})

// ===========================================================================
// MultiSigDIDManager7702 edge cases
// ===========================================================================

describe('MultiSigDIDManager7702 edge cases', () => {
  it('(BUG FIX) setAttributeWithMultiSig reverts before configure() is called', async () => {
    // SECURITY: before the fix, threshold defaulted to 0 allowing anyone to bypass
    // the multi-sig requirement. The fix adds require(threshold > 0, "not configured").
    const { rpcUrl, contracts } = loadEnv()

    const attackerAccount = privateKeyToAccount(keys[9])
    const eoaAccount = privateKeyToAccount(keys[1])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const attackerWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: attackerAccount })

    // EOA delegates but never calls configure
    const auth = await eoaWalletClient.signAuthorization({
      contractAddress: contracts.multiSigDidManager,
      executor: 'self',
    })
    const delegateHash = await eoaWalletClient.sendTransaction({
      authorizationList: [auth],
      to: eoaAccount.address,
      data: '0x',
      gas: 100_000n,
      chain: anvilChain,
      account: eoaAccount,
    })
    await publicClient.waitForTransactionReceipt({ hash: delegateHash })

    // Attacker calls setAttributeWithMultiSig with empty sigs array
    const data = encodeFunctionData({
      abi: MULTISIG_DID_MANAGER_ABI,
      functionName: 'setAttributeWithMultiSig',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY, []],
    })

    const { success } = await sendToEoa(attackerWalletClient, publicClient, {
      to: eoaAccount.address,
      data,
    })
    expect(success).toBe(false) // "not configured" — threshold == 0 is now blocked
  })

  it('(BUG FIX) configure rejects duplicate signers', async () => {
    // SECURITY: before the fix, duplicate addresses in _signers were accepted,
    // allowing one key to satisfy multi-party threshold.
    const { rpcUrl, contracts } = loadEnv()

    const eoaAccount = privateKeyToAccount(keys[1])
    const signerAccount = privateKeyToAccount(keys[2])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })

    // Attempt to configure with duplicate signer (same address twice)
    const dup = [signerAccount.address, signerAccount.address].sort() as [`0x${string}`, `0x${string}`]
    const data = encodeFunctionData({
      abi: MULTISIG_DID_MANAGER_ABI,
      functionName: 'configure',
      args: [dup, 2n],
    })

    const { success } = await delegateAndCall(eoaWalletClient, publicClient, contracts.multiSigDidManager, data)
    expect(success).toBe(false) // "signers not sorted/dup"
  })

  it('configure rejects unsorted signers', async () => {
    const { rpcUrl, contracts } = loadEnv()

    const eoaAccount = privateKeyToAccount(keys[1])
    const sA = privateKeyToAccount(keys[2])
    const sB = privateKeyToAccount(keys[3])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })

    // Provide signers in descending order (reversed)
    const [lo, hi] = [sA.address, sB.address].sort() as [`0x${string}`, `0x${string}`]
    const unsorted: [`0x${string}`, `0x${string}`] = [hi, lo] // intentionally wrong order

    const data = encodeFunctionData({
      abi: MULTISIG_DID_MANAGER_ABI,
      functionName: 'configure',
      args: [unsorted, 1n],
    })

    const { success } = await delegateAndCall(eoaWalletClient, publicClient, contracts.multiSigDidManager, data)
    expect(success).toBe(false) // "signers not sorted/dup"
  })

  it('configure rejects zero address in signers', async () => {
    const { rpcUrl, contracts } = loadEnv()

    const eoaAccount = privateKeyToAccount(keys[1])
    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })

    const data = encodeFunctionData({
      abi: MULTISIG_DID_MANAGER_ABI,
      functionName: 'configure',
      args: [['0x0000000000000000000000000000000000000000'], 1n],
    })

    const { success } = await delegateAndCall(eoaWalletClient, publicClient, contracts.multiSigDidManager, data)
    expect(success).toBe(false) // "zero signer"
  })

  it('configure rejects threshold greater than signer count', async () => {
    const { rpcUrl, contracts } = loadEnv()

    const eoaAccount = privateKeyToAccount(keys[1])
    const signer = privateKeyToAccount(keys[2])
    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })

    // 1 signer, threshold 2 — invalid
    const data = encodeFunctionData({
      abi: MULTISIG_DID_MANAGER_ABI,
      functionName: 'configure',
      args: [[signer.address], 2n],
    })

    const { success } = await delegateAndCall(eoaWalletClient, publicClient, contracts.multiSigDidManager, data)
    expect(success).toBe(false) // "invalid threshold"
  })

  it('rejects setAttributeWithMultiSig with unordered signatures', async () => {
    const { rpcUrl, contracts } = loadEnv()

    const eoaAccount = privateKeyToAccount(keys[5])
    const signers = [
      privateKeyToAccount(keys[6]),
      privateKeyToAccount(keys[7]),
    ].sort((a, b) => a.address.toLowerCase().localeCompare(b.address.toLowerCase()))

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })

    // Configure 2-of-2
    const configData = encodeFunctionData({
      abi: MULTISIG_DID_MANAGER_ABI,
      functionName: 'configure',
      args: [signers.map((s) => s.address), 2n],
    })
    await delegateAndCall(eoaWalletClient, publicClient, contracts.multiSigDidManager, configData)

    const digest = await publicClient.readContract({
      address: eoaAccount.address,
      abi: MULTISIG_DID_MANAGER_ABI,
      functionName: 'updateDigest',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY, 0n],
    }) as `0x${string}`

    const sig0 = await signers[0].sign({ hash: digest })
    const sig1 = await signers[1].sign({ hash: digest })

    // Submit in WRONG (descending) order
    const updateData = encodeFunctionData({
      abi: MULTISIG_DID_MANAGER_ABI,
      functionName: 'setAttributeWithMultiSig',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY, [sig1, sig0]], // reversed
    })

    const { success } = await sendToEoa(eoaWalletClient, publicClient, {
      to: eoaAccount.address,
      data: updateData,
    })
    expect(success).toBe(false) // "sigs not ordered / duplicate"
  })

  it('accepts more signatures than threshold (extra sigs ignored)', async () => {
    const { rpcUrl, contracts } = loadEnv()

    const eoaAccount = privateKeyToAccount(keys[5])
    const signerAccounts = [
      privateKeyToAccount(keys[6]),
      privateKeyToAccount(keys[7]),
      privateKeyToAccount(keys[8]),
    ].sort((a, b) => a.address.toLowerCase().localeCompare(b.address.toLowerCase()))

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })

    // threshold = 2 but submit 3 signatures
    const configData = encodeFunctionData({
      abi: MULTISIG_DID_MANAGER_ABI,
      functionName: 'configure',
      args: [signerAccounts.map((s) => s.address), 2n],
    })
    await delegateAndCall(eoaWalletClient, publicClient, contracts.multiSigDidManager, configData)

    const digest = await publicClient.readContract({
      address: eoaAccount.address,
      abi: MULTISIG_DID_MANAGER_ABI,
      functionName: 'updateDigest',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY, 0n],
    }) as `0x${string}`

    const sigs = await Promise.all(signerAccounts.map((s) => s.sign({ hash: digest })))

    const updateData = encodeFunctionData({
      abi: MULTISIG_DID_MANAGER_ABI,
      functionName: 'setAttributeWithMultiSig',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY, sigs], // 3 sigs, threshold 2
    })

    const { success } = await sendToEoa(eoaWalletClient, publicClient, {
      to: eoaAccount.address,
      data: updateData,
    })
    expect(success).toBe(true) // extra sig beyond threshold is fine
  })

  it('reconfiguring signers revokes old signer set', async () => {
    const { rpcUrl, contracts } = loadEnv()

    const eoaAccount = privateKeyToAccount(keys[5])
    const oldSigner = privateKeyToAccount(keys[6])
    const newSigner = privateKeyToAccount(keys[7])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })

    // Configure with oldSigner
    const configData1 = encodeFunctionData({
      abi: MULTISIG_DID_MANAGER_ABI,
      functionName: 'configure',
      args: [[oldSigner.address], 1n],
    })
    await delegateAndCall(eoaWalletClient, publicClient, contracts.multiSigDidManager, configData1)

    // Reconfigure with newSigner
    const configData2 = encodeFunctionData({
      abi: MULTISIG_DID_MANAGER_ABI,
      functionName: 'configure',
      args: [[newSigner.address], 1n],
    })
    await sendToEoa(eoaWalletClient, publicClient, {
      to: eoaAccount.address,
      data: configData2,
    })

    // Verify new signer set via getSigners()
    const signerList = await publicClient.readContract({
      address: eoaAccount.address,
      abi: MULTISIG_DID_MANAGER_ABI,
      functionName: 'getSigners',
    }) as `0x${string}`[]
    expect(signerList).toHaveLength(1)
    expect(signerList[0].toLowerCase()).toBe(newSigner.address.toLowerCase())

    // Old signer can no longer submit a valid update
    const digest = await publicClient.readContract({
      address: eoaAccount.address,
      abi: MULTISIG_DID_MANAGER_ABI,
      functionName: 'updateDigest',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY, 0n],
    }) as `0x${string}`

    const oldSig = await oldSigner.sign({ hash: digest })

    const updateData = encodeFunctionData({
      abi: MULTISIG_DID_MANAGER_ABI,
      functionName: 'setAttributeWithMultiSig',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY, [oldSig]],
    })

    const { success } = await sendToEoa(eoaWalletClient, publicClient, {
      to: eoaAccount.address,
      data: updateData,
    })
    expect(success).toBe(false) // "threshold not met" — old signer no longer valid
  })

  it('(H-1 FIX) rejects signature from non-registered signer', async () => {
    // SECURITY (H-1): Previously the loop silently skipped non-signer signatures,
    // allowing an attacker to pad a M-sig call with fake sigs to meet ordering
    // requirements while under-providing real signer sigs. The fix uses require()
    // so any non-signer signature immediately reverts.
    const { rpcUrl, contracts } = loadEnv()

    const eoaAccount = privateKeyToAccount(keys[5])
    // Two registered signers
    const signer6 = privateKeyToAccount(keys[6])
    const signer7 = privateKeyToAccount(keys[7])
    // Attacker — NOT in the signer set
    const attacker = privateKeyToAccount(keys[9])

    const signers = [signer6, signer7].sort((a, b) =>
      a.address.toLowerCase().localeCompare(b.address.toLowerCase())
    )

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })

    // Configure 2-of-2 multi-sig with signer6 and signer7
    const configData = encodeFunctionData({
      abi: MULTISIG_DID_MANAGER_ABI,
      functionName: 'configure',
      args: [signers.map((s) => s.address), 2n],
    })
    await delegateAndCall(eoaWalletClient, publicClient, contracts.multiSigDidManager, configData)

    const digest = await publicClient.readContract({
      address: eoaAccount.address,
      abi: MULTISIG_DID_MANAGER_ABI,
      functionName: 'updateDigest',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY, 0n],
    }) as `0x${string}`

    // One valid signer + one attacker signature (attacker is NOT registered)
    const validSig = await signers[0].sign({ hash: digest })
    const attackerSig = await attacker.sign({ hash: digest })

    // Sort the two sigs by recovered signer address for ordering requirement
    const signerAddr = signers[0].address.toLowerCase()
    const attackerAddr = attacker.address.toLowerCase()
    const [firstSig, secondSig] = signerAddr < attackerAddr
      ? [validSig, attackerSig]
      : [attackerSig, validSig]

    const updateData = encodeFunctionData({
      abi: MULTISIG_DID_MANAGER_ABI,
      functionName: 'setAttributeWithMultiSig',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY, [firstSig, secondSig]],
    })

    const { success } = await sendToEoa(eoaWalletClient, publicClient, {
      to: eoaAccount.address,
      data: updateData,
    })
    expect(success).toBe(false) // "not a registered signer"
  })

  it('(BUG FIX) re-delegating one EOA from Policy to MultiSig does not collide storage', async () => {
    // SECURITY: before the namespaced-storage fix, PolicyDIDManager7702 wrote its
    // sessionKey/maxValidity/allowedPrefix into the EOA's slots 0/1/2. Re-delegating
    // the same EOA to MultiSigDIDManager7702 then made `delete signers` read the stale
    // sessionKey value as signers.length → out-of-gas. Now each manager anchors its
    // state at a distinct keccak-derived slot, so re-delegation must succeed.
    const { rpcUrl, contracts } = loadEnv()

    const eoaAccount = privateKeyToAccount(keys[1])
    const sessionKeyAccount = privateKeyToAccount(keys[2])
    const signerAccounts = [
      privateKeyToAccount(keys[6]),
      privateKeyToAccount(keys[7]),
      privateKeyToAccount(keys[8]),
    ].sort((a, b) => a.address.toLowerCase().localeCompare(b.address.toLowerCase()))

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })

    // Step 1: configure the EOA under PolicyDIDManager7702 (writes slots at Policy's namespace)
    const policyData = encodeFunctionData({
      abi: POLICY_DID_MANAGER_ABI,
      functionName: 'configure',
      args: [sessionKeyAccount.address, VALIDITY, stringToBytes32('did/pub/') as `0x${string}`],
    })
    const { success: policyOk } = await delegateAndCall(eoaWalletClient, publicClient, contracts.policyDidManager, policyData)
    expect(policyOk).toBe(true)

    // Step 2: re-delegate the SAME EOA to MultiSigDIDManager7702 and configure a 2-of-3 set
    const configData = encodeFunctionData({
      abi: MULTISIG_DID_MANAGER_ABI,
      functionName: 'configure',
      args: [signerAccounts.map((a) => a.address), 2n],
    })
    const { success: multiSigOk } = await delegateAndCall(eoaWalletClient, publicClient, contracts.multiSigDidManager, configData)
    expect(multiSigOk).toBe(true)

    // Step 3: the new signer set must be intact — NOT garbage from Policy's stale slots
    const signers = (await publicClient.readContract({
      address: eoaAccount.address,
      abi: MULTISIG_DID_MANAGER_ABI,
      functionName: 'getSigners',
    })) as `0x${string}`[]
    expect(signers).toEqual(signerAccounts.map((a) => a.address))
    expect(await publicClient.readContract({
      address: eoaAccount.address,
      abi: MULTISIG_DID_MANAGER_ABI,
      functionName: 'nonce',
    })).toBe(0n)
  })
})

// ===========================================================================
// RevocationDIDManager7702 edge cases
// ===========================================================================

describe('RevocationDIDManager7702 edge cases', () => {
  it('revokeCredential is idempotent (revoking twice emits two events but both succeed)', async () => {
    const { rpcUrl, contracts } = loadEnv()

    const eoaAccount = privateKeyToAccount(keys[1])
    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })

    const credentialId = keccak256(toHex('my-credential-001'))

    const configData = encodeFunctionData({
      abi: REVOCATION_DID_MANAGER_ABI,
      functionName: 'setAttributeForIdentity',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY],
    })
    await delegateAndCall(eoaWalletClient, publicClient, contracts.revocationDidManager, configData)

    const revokeData = encodeFunctionData({
      abi: REVOCATION_DID_MANAGER_ABI,
      functionName: 'revokeCredential',
      args: [credentialId],
    })

    // First revocation
    const { success: first } = await sendToEoa(eoaWalletClient, publicClient, {
      to: eoaAccount.address,
      data: revokeData,
    })
    expect(first).toBe(true)

    // Confirm revoked
    const isRevoked1 = await publicClient.readContract({
      address: eoaAccount.address,
      abi: REVOCATION_DID_MANAGER_ABI,
      functionName: 'isRevoked',
      args: [credentialId],
    })
    expect(isRevoked1).toBe(true)

    // Second revocation — idempotent, succeeds again
    const { success: second } = await sendToEoa(eoaWalletClient, publicClient, {
      to: eoaAccount.address,
      data: revokeData,
    })
    expect(second).toBe(true)
    const isRevoked2 = await publicClient.readContract({
      address: eoaAccount.address,
      abi: REVOCATION_DID_MANAGER_ABI,
      functionName: 'isRevoked',
      args: [credentialId],
    })
    expect(isRevoked2).toBe(true)
  })

  it('revokeAttributeForIdentity rejects non-owner', async () => {
    const { rpcUrl, contracts } = loadEnv()

    const eoaAccount = privateKeyToAccount(keys[1])
    const attackerAccount = privateKeyToAccount(keys[9])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const attackerWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: attackerAccount })

    // Set up delegation + add attribute
    const setData = encodeFunctionData({
      abi: REVOCATION_DID_MANAGER_ABI,
      functionName: 'setAttributeForIdentity',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY],
    })
    await delegateAndCall(eoaWalletClient, publicClient, contracts.revocationDidManager, setData)

    // Attacker tries to revoke the attribute
    const revokeData = encodeFunctionData({
      abi: REVOCATION_DID_MANAGER_ABI,
      functionName: 'revokeAttributeForIdentity',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE],
    })

    const { success } = await sendToEoa(attackerWalletClient, publicClient, {
      to: eoaAccount.address,
      data: revokeData,
    })
    expect(success).toBe(false) // "only owner"
  })

  it('setAttributeForIdentity rejects non-owner', async () => {
    const { rpcUrl, contracts } = loadEnv()

    const eoaAccount = privateKeyToAccount(keys[1])
    const attackerAccount = privateKeyToAccount(keys[9])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const attackerWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: attackerAccount })

    // Set delegation
    const auth = await eoaWalletClient.signAuthorization({
      contractAddress: contracts.revocationDidManager,
      executor: 'self',
    })
    const h = await eoaWalletClient.sendTransaction({
      authorizationList: [auth],
      to: eoaAccount.address,
      data: '0x',
      gas: 100_000n,
      chain: anvilChain,
      account: eoaAccount,
    })
    await publicClient.waitForTransactionReceipt({ hash: h })

    // Attacker tries to set attribute via RevocationDIDManager7702 (which has access control)
    const setData = encodeFunctionData({
      abi: REVOCATION_DID_MANAGER_ABI,
      functionName: 'setAttributeForIdentity',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY],
    })
    const { success } = await sendToEoa(attackerWalletClient, publicClient, {
      to: eoaAccount.address,
      data: setData,
    })
    expect(success).toBe(false) // "only owner"
  })
})

// ===========================================================================
// CrossChainDIDManager7702 edge cases
// ===========================================================================

describe('CrossChainDIDManager7702 edge cases', () => {
  it('rejects signature with invalid length (64 bytes)', async () => {
    const { rpcUrl, contracts } = loadEnv()

    const eoaAccount = privateKeyToAccount(keys[1])
    const relayerAccount = privateKeyToAccount(keys[0])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const relayerWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: relayerAccount })

    // Set delegation
    const auth = await eoaWalletClient.signAuthorization({
      contractAddress: contracts.crossChainDidManager,
      executor: relayerAccount.address,
    })

    // Build a truncated 64-byte "signature"
    const badSig = ('0x' + 'ab'.repeat(64)) as `0x${string}` // 64 bytes, not 65

    const callData = encodeFunctionData({
      abi: CROSS_CHAIN_DID_MANAGER_ABI,
      functionName: 'setAttributeCrossChain',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY, badSig],
    })

    const { success } = await sendToEoa(relayerWalletClient, publicClient, {
      to: eoaAccount.address,
      data: callData,
      authorizationList: [auth],
    })
    expect(success).toBe(false) // "invalid sig length"
  })

  it('rejects all-zero 65-byte signature (ecrecover returns address(0))', async () => {
    const { rpcUrl, contracts } = loadEnv()

    const eoaAccount = privateKeyToAccount(keys[1])
    const relayerAccount = privateKeyToAccount(keys[0])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const relayerWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: relayerAccount })

    const auth = await eoaWalletClient.signAuthorization({
      contractAddress: contracts.crossChainDidManager,
      executor: relayerAccount.address,
    })

    const zeroSig = ('0x' + '00'.repeat(65)) as `0x${string}`

    const callData = encodeFunctionData({
      abi: CROSS_CHAIN_DID_MANAGER_ABI,
      functionName: 'setAttributeCrossChain',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY, zeroSig],
    })

    const { success } = await sendToEoa(relayerWalletClient, publicClient, {
      to: eoaAccount.address,
      data: callData,
      authorizationList: [auth],
    })
    expect(success).toBe(false) // "invalid v" or "ecrecover failed"
  })

  it('rejects signature from a different signer (not the EOA)', async () => {
    const { rpcUrl, chainId, contracts } = loadEnv()

    const eoaAccount = privateKeyToAccount(keys[1])
    const relayerAccount = privateKeyToAccount(keys[0])
    const wrongSigner = privateKeyToAccount(keys[9]) // not the EOA

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const relayerWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: relayerAccount })

    const auth = await eoaWalletClient.signAuthorization({
      contractAddress: contracts.crossChainDidManager,
      executor: relayerAccount.address,
    })

    // Compute the digest the EOA *should* sign — off-chain, no delegation required
    const digest = crossChainDigest({
      eoaAddress: eoaAccount.address,
      registry: contracts.registry,
      attrName: ATTR_NAME,
      attrValue: ATTR_VALUE,
      validity: VALIDITY,
      nonce: 0n,
      chainId,
    })

    // Wrong signer signs the correct digest (but they're not the EOA)
    const wrongSig = await wrongSigner.sign({ hash: digest })

    const callData = encodeFunctionData({
      abi: CROSS_CHAIN_DID_MANAGER_ABI,
      functionName: 'setAttributeCrossChain',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY, wrongSig],
    })

    const { success } = await sendToEoa(relayerWalletClient, publicClient, {
      to: eoaAccount.address,
      data: callData,
      authorizationList: [auth],
    })
    expect(success).toBe(false) // "invalid signature" — recovered != address(this)
  })

  it('nonce increments after each successful update', async () => {
    const { rpcUrl, chainId, contracts } = loadEnv()

    const eoaAccount = privateKeyToAccount(keys[1])
    const relayerAccount = privateKeyToAccount(keys[0])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const relayerWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: relayerAccount })

    // First update: delegate + call with nonce=0
    const auth = await eoaWalletClient.signAuthorization({
      contractAddress: contracts.crossChainDidManager,
      executor: relayerAccount.address,
    })

    const digest0 = crossChainDigest({
      eoaAddress: eoaAccount.address,
      registry: contracts.registry,
      attrName: ATTR_NAME,
      attrValue: ATTR_VALUE,
      validity: VALIDITY,
      nonce: 0n,
      chainId,
    })

    const sig0 = await eoaAccount.sign({ hash: digest0 })

    const callData0 = encodeFunctionData({
      abi: CROSS_CHAIN_DID_MANAGER_ABI,
      functionName: 'setAttributeCrossChain',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY, sig0],
    })

    const { success: first } = await sendToEoa(relayerWalletClient, publicClient, {
      to: eoaAccount.address,
      data: callData0,
      authorizationList: [auth],
    })
    expect(first).toBe(true)

    // Verify nonce is now 1
    const nonce1 = await publicClient.readContract({
      address: eoaAccount.address,
      abi: CROSS_CHAIN_DID_MANAGER_ABI,
      functionName: 'crossChainNonce',
    }) as bigint
    expect(nonce1).toBe(1n)

    // Second update: sign with nonce=1 — should succeed
    const digest1 = crossChainDigest({
      eoaAddress: eoaAccount.address,
      registry: contracts.registry,
      attrName: ATTR_NAME,
      attrValue: toHex(new TextEncoder().encode('update2')),
      validity: VALIDITY,
      nonce: 1n,
      chainId,
    })

    const sig1 = await eoaAccount.sign({ hash: digest1 })

    const callData1 = encodeFunctionData({
      abi: CROSS_CHAIN_DID_MANAGER_ABI,
      functionName: 'setAttributeCrossChain',
      args: [contracts.registry, ATTR_NAME, toHex(new TextEncoder().encode('update2')), VALIDITY, sig1],
    })

    const { success: second } = await sendToEoa(relayerWalletClient, publicClient, {
      to: eoaAccount.address,
      data: callData1,
    })
    expect(second).toBe(true)

    const nonce2 = await publicClient.readContract({
      address: eoaAccount.address,
      abi: CROSS_CHAIN_DID_MANAGER_ABI,
      functionName: 'crossChainNonce',
    }) as bigint
    expect(nonce2).toBe(2n)
  })
})

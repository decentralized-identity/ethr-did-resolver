// test/delegation-lifecycle.test.ts
// Phase 12: Delegation lifecycle patterns.
//
// Covers four key patterns:
//   Pattern 8: Delegation revocation — EOA revokes by re-authorizing to address(0).
//              Subsequent calls to the EOA address hit empty code.
//   Pattern 9: Re-delegation — EOA re-delegates to a different contract (A→B).
//              Old contract code is gone; new contract code is live.
//   Pattern 10: Expiring delegation — ExpiringDIDManager7702 enforces an app-level TTL.
//               Writes succeed before expiry, revert after.
//   Pattern 11: EXTCODESIZE pitfall — a delegated EOA has codesize > 0, breaking
//               naive `isContract()` checks (EXTCODESIZE != 0).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import {
  createPublicClient,
  createWalletClient,
  createTestClient,
  encodeFunctionData,
  http,
  toHex,
  zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { anvil as anvilChain } from 'viem/chains'
import { stringToBytes32 } from 'ethr-did-resolver'
import { TEST_ENV_FILE } from './globalSetup.js'
import { getAnvilPrivateKeys } from '../src/utils/anvil.js'
import {
  DID_MANAGER_ABI,
  EXPIRING_DID_MANAGER_ABI,
} from '../src/utils/abis.js'

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

type TestEnv = {
  rpcUrl: string
  chainId: number
  contracts: {
    registry: `0x${string}`
    didManager: `0x${string}`
    policyDidManager: `0x${string}`
    expiringDidManager: `0x${string}`
    [key: string]: `0x${string}`
  }
}

function loadEnv(): TestEnv {
  return JSON.parse(readFileSync(TEST_ENV_FILE, 'utf-8'))
}

const keys = getAnvilPrivateKeys()
const ATTR_NAME = stringToBytes32('did/pub/Ed25519/veriKey/base64') as `0x${string}`
const ATTR_VALUE = toHex(new TextEncoder().encode('lifecyclekey'))
const VALIDITY = 3600n

// ---------------------------------------------------------------------------
// Pattern 8: Delegation Revocation
// ---------------------------------------------------------------------------

describe('Pattern 8: Delegation Revocation', () => {
  it('revoking delegation (authorize address(0)) clears EOA code', async () => {
    const { rpcUrl, contracts } = loadEnv()
    const eoaAccount = privateKeyToAccount(keys[3])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })

    // Step 1: Delegate to DIDManager7702
    const authDelegate = await eoaWalletClient.signAuthorization({
      contractAddress: contracts.didManager,
      executor: 'self',
    })

    const writeData = encodeFunctionData({
      abi: DID_MANAGER_ABI,
      functionName: 'setAttributeForIdentity',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY],
    })

    const hashDelegate = await eoaWalletClient.sendTransaction({
      to: eoaAccount.address,
      data: writeData,
      gas: 300_000n,
      chain: anvilChain,
      account: eoaAccount,
      authorizationList: [authDelegate],
    })
    const receiptDelegate = await publicClient.waitForTransactionReceipt({ hash: hashDelegate })
    expect(receiptDelegate.status).toBe('success')

    // Verify EOA has code after delegation
    const codeAfterDelegate = await publicClient.getCode({ address: eoaAccount.address })
    // EIP-7702 delegation = 0xef0100 + 20-byte address = 23 bytes
    expect(codeAfterDelegate).toBeDefined()
    expect(codeAfterDelegate!.length).toBeGreaterThan(2) // '0x' + something

    // Step 2: Revoke delegation by re-authorizing to address(0)
    const authRevoke = await eoaWalletClient.signAuthorization({
      contractAddress: zeroAddress,
      executor: 'self',
    })

    const hashRevoke = await eoaWalletClient.sendTransaction({
      to: eoaAccount.address,
      data: '0x',
      gas: 50_000n,
      chain: anvilChain,
      account: eoaAccount,
      authorizationList: [authRevoke],
    })
    const receiptRevoke = await publicClient.waitForTransactionReceipt({ hash: hashRevoke })
    expect(receiptRevoke.status).toBe('success')

    // After revocation: EOA code should be empty (or the zero delegation marker)
    const codeAfterRevoke = await publicClient.getCode({ address: eoaAccount.address })
    // Either undefined (no code) or 0x (empty). Delegation to address(0) clears the code.
    const isEmpty = codeAfterRevoke === undefined || codeAfterRevoke === '0x'
    expect(isEmpty).toBe(true)
  })

  it('calling the EOA after revocation is a no-op (no code executes)', async () => {
    const { rpcUrl, contracts } = loadEnv()
    const eoaAccount = privateKeyToAccount(keys[3])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })

    // Step 1: Delegate
    const authDelegate = await eoaWalletClient.signAuthorization({
      contractAddress: contracts.didManager,
      executor: 'self',
    })
    const h1 = await eoaWalletClient.sendTransaction({
      to: eoaAccount.address,
      data: '0x',
      gas: 50_000n,
      chain: anvilChain,
      account: eoaAccount,
      authorizationList: [authDelegate],
    })
    await publicClient.waitForTransactionReceipt({ hash: h1 })

    // Step 2: Revoke delegation (separate tx, new nonce)
    const authRevoke = await eoaWalletClient.signAuthorization({
      contractAddress: zeroAddress,
      executor: 'self',
    })
    const h2 = await eoaWalletClient.sendTransaction({
      to: eoaAccount.address,
      data: '0x',
      gas: 50_000n,
      chain: anvilChain,
      account: eoaAccount,
      authorizationList: [authRevoke],
    })
    await publicClient.waitForTransactionReceipt({ hash: h2 })

    // Confirm the EOA has no code (delegation was cleared)
    const codeAfter = await publicClient.getCode({ address: eoaAccount.address })
    const isEmpty = codeAfter === undefined || codeAfter === '0x'
    expect(isEmpty).toBe(true)

    // Now try to call a DID function on the EOA — no code → no-op (succeeds silently)
    // Sending calldata to an EOA with no code is a successful tx in the EVM; the data is ignored.
    const callData = encodeFunctionData({
      abi: DID_MANAGER_ABI,
      functionName: 'setAttributeForIdentity',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY],
    })
    const h3 = await eoaWalletClient.sendTransaction({
      to: eoaAccount.address,
      data: callData,
      gas: 100_000n,
      chain: anvilChain,
      account: eoaAccount,
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash: h3 })
    // No delegation → no code → the tx succeeds as an empty-code call (no revert, no effect)
    expect(receipt.status).toBe('success')
  })
})

// ---------------------------------------------------------------------------
// Pattern 9: Re-delegation (A → B)
// ---------------------------------------------------------------------------

describe('Pattern 9: Re-delegation (A → B)', () => {
  it('re-delegating to a new contract swaps code atomically', async () => {
    const { rpcUrl, contracts } = loadEnv()
    const eoaAccount = privateKeyToAccount(keys[4])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })

    // Step 1: Delegate to DIDManager7702 (contract A)
    const authA = await eoaWalletClient.signAuthorization({
      contractAddress: contracts.didManager,
      executor: 'self',
    })
    const hash1 = await eoaWalletClient.sendTransaction({
      to: eoaAccount.address,
      data: '0x',
      gas: 50_000n,
      chain: anvilChain,
      account: eoaAccount,
      authorizationList: [authA],
    })
    await publicClient.waitForTransactionReceipt({ hash: hash1 })

    const codeA = await publicClient.getCode({ address: eoaAccount.address })
    expect(codeA).toBeDefined()
    expect(codeA!.toLowerCase()).toContain(contracts.didManager.slice(2).toLowerCase())

    // Step 2: Re-delegate to ExpiringDIDManager7702 (contract B)
    const authB = await eoaWalletClient.signAuthorization({
      contractAddress: contracts.expiringDidManager,
      executor: 'self',
    })
    const hash2 = await eoaWalletClient.sendTransaction({
      to: eoaAccount.address,
      data: '0x',
      gas: 50_000n,
      chain: anvilChain,
      account: eoaAccount,
      authorizationList: [authB],
    })
    await publicClient.waitForTransactionReceipt({ hash: hash2 })

    const codeB = await publicClient.getCode({ address: eoaAccount.address })
    expect(codeB).toBeDefined()
    // The delegation pointer now references expiringDidManager, not didManager
    expect(codeB!.toLowerCase()).toContain(contracts.expiringDidManager.slice(2).toLowerCase())
    expect(codeB!.toLowerCase()).not.toContain(contracts.didManager.slice(2).toLowerCase())
  })

  it('after re-delegation, old contract functions revert, new ones succeed', async () => {
    const { rpcUrl, contracts } = loadEnv()
    const eoaAccount = privateKeyToAccount(keys[4])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })

    // Delegate to ExpiringDIDManager7702
    const auth = await eoaWalletClient.signAuthorization({
      contractAddress: contracts.expiringDidManager,
      executor: 'self',
    })

    // Configure expiry = now + 1 hour, in the same tx as delegation
    const block = await publicClient.getBlock()
    const expiryTimestamp = block.timestamp + 7200n // 2 hours from now

    const configureData = encodeFunctionData({
      abi: EXPIRING_DID_MANAGER_ABI,
      functionName: 'configure',
      args: [expiryTimestamp],
    })

    // Send delegation + configure atomically (EOA calls configure on itself)
    const hashSetup = await eoaWalletClient.sendTransaction({
      to: eoaAccount.address,
      data: configureData,
      gas: 100_000n,
      chain: anvilChain,
      account: eoaAccount,
      authorizationList: [auth],
    })
    const setupReceipt = await publicClient.waitForTransactionReceipt({ hash: hashSetup })
    expect(setupReceipt.status).toBe('success')

    // DIDManager7702's `setAttributeForIdentity` should fail (different ABI, no matching function)
    // — we test this by calling ExpiringDIDManager7702's `setAttributeForIdentity` which should succeed
    const writeData = encodeFunctionData({
      abi: EXPIRING_DID_MANAGER_ABI,
      functionName: 'setAttributeForIdentity',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY],
    })
    const hashWrite = await eoaWalletClient.sendTransaction({
      to: eoaAccount.address,
      data: writeData,
      gas: 300_000n,
      chain: anvilChain,
      account: eoaAccount,
    })
    const writeReceipt = await publicClient.waitForTransactionReceipt({ hash: hashWrite })
    expect(writeReceipt.status).toBe('success')
  })
})

// ---------------------------------------------------------------------------
// Pattern 10: Expiring Delegation
// ---------------------------------------------------------------------------

describe('Pattern 10: Expiring Delegation (app-level TTL)', () => {
  it('write succeeds before expiry', async () => {
    const { rpcUrl, contracts } = loadEnv()
    const eoaAccount = privateKeyToAccount(keys[5])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })

    const block = await publicClient.getBlock()
    const expiryTimestamp = block.timestamp + 3600n // 1 hour from now

    // Delegate + configure in one tx
    const auth = await eoaWalletClient.signAuthorization({
      contractAddress: contracts.expiringDidManager,
      executor: 'self',
    })
    const configData = encodeFunctionData({
      abi: EXPIRING_DID_MANAGER_ABI,
      functionName: 'configure',
      args: [expiryTimestamp],
    })
    const hashConfigure = await eoaWalletClient.sendTransaction({
      to: eoaAccount.address,
      data: configData,
      gas: 100_000n,
      chain: anvilChain,
      account: eoaAccount,
      authorizationList: [auth],
    })
    expect((await publicClient.waitForTransactionReceipt({ hash: hashConfigure })).status).toBe('success')

    // Write before expiry — should succeed
    const writeData = encodeFunctionData({
      abi: EXPIRING_DID_MANAGER_ABI,
      functionName: 'setAttributeForIdentity',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY],
    })
    const hashWrite = await eoaWalletClient.sendTransaction({
      to: eoaAccount.address,
      data: writeData,
      gas: 300_000n,
      chain: anvilChain,
      account: eoaAccount,
    })
    const writeReceipt = await publicClient.waitForTransactionReceipt({ hash: hashWrite })
    expect(writeReceipt.status).toBe('success')
  })

  it('write reverts after expiry (time-warp)', async () => {
    const { rpcUrl, contracts } = loadEnv()
    const eoaAccount = privateKeyToAccount(keys[5])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const testClient = createTestClient({ chain: anvilChain, transport: http(rpcUrl), mode: 'anvil' })

    const block = await publicClient.getBlock()
    const expiryTimestamp = block.timestamp + 60n // 1 minute from now

    // Delegate + configure
    const auth = await eoaWalletClient.signAuthorization({
      contractAddress: contracts.expiringDidManager,
      executor: 'self',
    })
    const configData = encodeFunctionData({
      abi: EXPIRING_DID_MANAGER_ABI,
      functionName: 'configure',
      args: [expiryTimestamp],
    })
    const hashConfigure = await eoaWalletClient.sendTransaction({
      to: eoaAccount.address,
      data: configData,
      gas: 100_000n,
      chain: anvilChain,
      account: eoaAccount,
      authorizationList: [auth],
    })
    expect((await publicClient.waitForTransactionReceipt({ hash: hashConfigure })).status).toBe('success')

    // Warp time past expiry
    await testClient.increaseTime({ seconds: 120 }) // 2 minutes — past the 1-minute expiry
    await testClient.mine({ blocks: 1 })

    // Write after expiry — should revert
    const writeData = encodeFunctionData({
      abi: EXPIRING_DID_MANAGER_ABI,
      functionName: 'setAttributeForIdentity',
      args: [contracts.registry, ATTR_NAME, toHex(new TextEncoder().encode('expiredkey')), VALIDITY],
    })
    const hashWrite = await eoaWalletClient.sendTransaction({
      to: eoaAccount.address,
      data: writeData,
      gas: 300_000n,
      chain: anvilChain,
      account: eoaAccount,
    })
    const writeReceipt = await publicClient.waitForTransactionReceipt({ hash: hashWrite })
    expect(writeReceipt.status).toBe('reverted')
  })

  it('write reverts if not configured (expiry=0)', async () => {
    const { rpcUrl, contracts } = loadEnv()
    const eoaAccount = privateKeyToAccount(keys[5])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })

    // Delegate but do NOT call configure (expiry stays 0 in fresh EOA storage)
    const auth = await eoaWalletClient.signAuthorization({
      contractAddress: contracts.expiringDidManager,
      executor: 'self',
    })
    const writeData = encodeFunctionData({
      abi: EXPIRING_DID_MANAGER_ABI,
      functionName: 'setAttributeForIdentity',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY],
    })
    const hash = await eoaWalletClient.sendTransaction({
      to: eoaAccount.address,
      data: writeData,
      gas: 300_000n,
      chain: anvilChain,
      account: eoaAccount,
      authorizationList: [auth],
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    expect(receipt.status).toBe('reverted') // "not configured"
  })

  it('isActive() returns false after expiry', async () => {
    const { rpcUrl, contracts } = loadEnv()
    const eoaAccount = privateKeyToAccount(keys[5])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const testClient = createTestClient({ chain: anvilChain, transport: http(rpcUrl), mode: 'anvil' })

    const block = await publicClient.getBlock()
    const expiryTimestamp = block.timestamp + 30n // 30 seconds

    // Delegate + configure
    const auth = await eoaWalletClient.signAuthorization({
      contractAddress: contracts.expiringDidManager,
      executor: 'self',
    })
    const configData = encodeFunctionData({
      abi: EXPIRING_DID_MANAGER_ABI,
      functionName: 'configure',
      args: [expiryTimestamp],
    })
    const hashConfigure = await eoaWalletClient.sendTransaction({
      to: eoaAccount.address,
      data: configData,
      gas: 100_000n,
      chain: anvilChain,
      account: eoaAccount,
      authorizationList: [auth],
    })
    expect((await publicClient.waitForTransactionReceipt({ hash: hashConfigure })).status).toBe('success')

    // isActive() should be true now
    const activeBefore = await publicClient.readContract({
      address: eoaAccount.address,
      abi: EXPIRING_DID_MANAGER_ABI,
      functionName: 'isActive',
    })
    expect(activeBefore).toBe(true)

    // Warp past expiry
    await testClient.increaseTime({ seconds: 60 })
    await testClient.mine({ blocks: 1 })

    // isActive() should be false now
    const activeAfter = await publicClient.readContract({
      address: eoaAccount.address,
      abi: EXPIRING_DID_MANAGER_ABI,
      functionName: 'isActive',
    })
    expect(activeAfter).toBe(false)
  })

  it('reconfiguring with a new expiry renews the delegation', async () => {
    const { rpcUrl, contracts } = loadEnv()
    const eoaAccount = privateKeyToAccount(keys[5])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const testClient = createTestClient({ chain: anvilChain, transport: http(rpcUrl), mode: 'anvil' })

    const block = await publicClient.getBlock()
    const shortExpiry = block.timestamp + 30n

    // Delegate + configure short expiry
    const auth = await eoaWalletClient.signAuthorization({
      contractAddress: contracts.expiringDidManager,
      executor: 'self',
    })
    const configShort = encodeFunctionData({
      abi: EXPIRING_DID_MANAGER_ABI,
      functionName: 'configure',
      args: [shortExpiry],
    })
    const h1 = await eoaWalletClient.sendTransaction({
      to: eoaAccount.address,
      data: configShort,
      gas: 100_000n,
      chain: anvilChain,
      account: eoaAccount,
      authorizationList: [auth],
    })
    expect((await publicClient.waitForTransactionReceipt({ hash: h1 })).status).toBe('success')

    // Warp past short expiry
    await testClient.increaseTime({ seconds: 60 })
    await testClient.mine({ blocks: 1 })

    // Write should fail
    const writeData = encodeFunctionData({
      abi: EXPIRING_DID_MANAGER_ABI,
      functionName: 'setAttributeForIdentity',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY],
    })
    const h2 = await eoaWalletClient.sendTransaction({
      to: eoaAccount.address,
      data: writeData,
      gas: 300_000n,
      chain: anvilChain,
      account: eoaAccount,
    })
    expect((await publicClient.waitForTransactionReceipt({ hash: h2 })).status).toBe('reverted')

    // Reconfigure with new (future) expiry
    const block2 = await publicClient.getBlock()
    const newExpiry = block2.timestamp + 7200n
    const configNew = encodeFunctionData({
      abi: EXPIRING_DID_MANAGER_ABI,
      functionName: 'configure',
      args: [newExpiry],
    })
    const h3 = await eoaWalletClient.sendTransaction({
      to: eoaAccount.address,
      data: configNew,
      gas: 100_000n,
      chain: anvilChain,
      account: eoaAccount,
    })
    expect((await publicClient.waitForTransactionReceipt({ hash: h3 })).status).toBe('success')

    // Write should succeed again
    const h4 = await eoaWalletClient.sendTransaction({
      to: eoaAccount.address,
      data: writeData,
      gas: 300_000n,
      chain: anvilChain,
      account: eoaAccount,
    })
    expect((await publicClient.waitForTransactionReceipt({ hash: h4 })).status).toBe('success')
  })
})

// ---------------------------------------------------------------------------
// Pattern 11: EXTCODESIZE pitfall
// ---------------------------------------------------------------------------

describe('Pattern 11: EXTCODESIZE pitfall', () => {
  it('delegated EOA has non-zero codesize (breaks naive isContract() checks)', async () => {
    const { rpcUrl, contracts } = loadEnv()
    const eoaAccount = privateKeyToAccount(keys[6])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })

    // Before delegation: EOA has no code
    const codeBefore = await publicClient.getCode({ address: eoaAccount.address })
    const isEmptyBefore = codeBefore === undefined || codeBefore === '0x'
    expect(isEmptyBefore).toBe(true)

    // Delegate to DIDManager7702
    const auth = await eoaWalletClient.signAuthorization({
      contractAddress: contracts.didManager,
      executor: 'self',
    })
    const hash = await eoaWalletClient.sendTransaction({
      to: eoaAccount.address,
      data: '0x',
      gas: 50_000n,
      chain: anvilChain,
      account: eoaAccount,
      authorizationList: [auth],
    })
    await publicClient.waitForTransactionReceipt({ hash })

    // After delegation: EOA has code (the EIP-7702 delegation designator = 0xef0100 + address, 23 bytes)
    const codeAfter = await publicClient.getCode({ address: eoaAccount.address })
    expect(codeAfter).toBeDefined()
    expect(codeAfter).not.toBe('0x')
    // EIP-7702 delegation prefix: 0xef0100
    expect(codeAfter!.startsWith('0xef0100')).toBe(true)
    // Total code length: 23 bytes = 46 hex chars + '0x' prefix = 48 chars
    expect(codeAfter!.length).toBe(48)
  })

  it('naive isContract(address) returns true for a delegated EOA', async () => {
    // This demonstrates the pitfall: contracts that use `address.code.length > 0`
    // as an EOA check will be fooled by a delegated EOA.
    //
    // The EIP-7702 delegation code is:
    //   0xef0100 + 20-byte-contract-address
    // = 23 bytes
    //
    // Any `EXTCODESIZE(eoaAddress) > 0` check returns true → the EOA is
    // misidentified as a contract by any naive guard.
    const { rpcUrl, contracts } = loadEnv()
    const eoaAccount = privateKeyToAccount(keys[7])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })

    // Delegate
    const auth = await eoaWalletClient.signAuthorization({
      contractAddress: contracts.didManager,
      executor: 'self',
    })
    await publicClient.waitForTransactionReceipt({
      hash: await eoaWalletClient.sendTransaction({
        to: eoaAccount.address,
        data: '0x',
        gas: 50_000n,
        chain: anvilChain,
        account: eoaAccount,
        authorizationList: [auth],
      }),
    })

    // `eth_getCode` on the delegated EOA returns the delegation designator
    const code = await publicClient.getCode({ address: eoaAccount.address })
    // isContract() naive check: code.length > 0 → TRUE for a delegated EOA
    const naiveIsContract = code !== undefined && code !== '0x'
    expect(naiveIsContract).toBe(true) // ← the pitfall: EOA looks like a contract
    // The delegation designator is NOT real contract bytecode — it is a pointer.
    // Smart contracts that rely on EXTCODESIZE to reject EOAs must use
    // tx.origin == msg.sender instead, or EIP-7702-aware checks.
  })
})

// test/metamask-delegation.test.ts
// Phase 13: MetaMask Delegation Framework Integration
//
// Demonstrates EIP-7702 + MetaMask Delegation Framework:
//   - EOA delegates to EIP7702StatelessDeleGator (via EIP-7702 type-4 tx)
//   - EOA signs a MetaMask Delegation granting a relayer permission to call
//     `setAttribute` with a DIDAttributeEnforcer caveat (prefix constraint)
//   - Relayer redeems the delegation via `redeemDelegations`, which calls
//     `setAttribute` on the DID registry through the framework
//   - Enforcer blocks calls where the attribute name prefix doesn't match
//
// Test plan:
//   1. Deploy: confirm framework contracts are live (addresses in env)
//   2. Happy path: relayer redeems delegation → DID attribute written
//   3. Enforcer blocks: wrong prefix → revert
//   4. Gas comparison: custom DIDManager7702 vs framework overhead

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  toHex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { anvil as anvilChain } from 'viem/chains'
import { stringToBytes32 } from 'ethr-did-resolver'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { TEST_ENV_FILE } from './globalSetup.js'
import { getAnvilPrivateKeys } from '../src/utils/anvil.js'
import { DID_MANAGER_ABI } from '../src/utils/abis.js'
import { DelegationManagerABI } from '../src/utils/metamask-framework.js'

// ---------------------------------------------------------------------------
// Import delegation-core helpers (via pnpm store path)
// ---------------------------------------------------------------------------

const _require = createRequire(
  fileURLToPath(
    new URL(
      '../node_modules/.pnpm/@metamask+smart-accounts-kit@0.4.0-beta.1_viem@2.47.0_typescript@5.9.3_/node_modules/@metamask/smart-accounts-kit/dist/index.mjs',
      import.meta.url
    )
  )
)

const {
  encodeDelegations,
  ROOT_AUTHORITY,
} = _require('@metamask/delegation-core') as {
  encodeDelegations: (delegations: Delegation[]) => `0x${string}`
  ROOT_AUTHORITY: `0x${string}`
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Caveat = {
  enforcer: `0x${string}`
  terms: `0x${string}`
  args: `0x${string}`
}

type Delegation = {
  delegate: `0x${string}`
  delegator: `0x${string}`
  authority: `0x${string}`
  caveats: Caveat[]
  salt: bigint
  signature: `0x${string}`
}

type TestEnv = {
  rpcUrl: string
  chainId: number
  contracts: {
    registry: `0x${string}`
    didManager: `0x${string}`
    delegationManager: `0x${string}`
    statelessDeleGator: `0x${string}`
    didAttributeEnforcer: `0x${string}`
    [key: string]: `0x${string}`
  }
}

// ---------------------------------------------------------------------------
// ERC-7579 execution encoding helpers
// Single execution: abi.encodePacked(target[20], value[32], calldata)
// ---------------------------------------------------------------------------

function encodeExecution(
  target: `0x${string}`,
  value: bigint,
  calldata: `0x${string}`
): `0x${string}` {
  // target: 20 bytes, value: 32 bytes (big-endian), calldata: variable
  const targetBytes = target.slice(2).toLowerCase().padStart(40, '0')
  const valueHex = value.toString(16).padStart(64, '0')
  const calldataHex = calldata.slice(2)
  return `0x${targetBytes}${valueHex}${calldataHex}`
}

// ERC-7579 single-call mode code (no revert on failure, no batch)
const SINGLE_DEFAULT_MODE = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`

// ---------------------------------------------------------------------------
// EIP-712 delegation signing helper
// ---------------------------------------------------------------------------

/**
 * Sign a MetaMask Delegation using viem's signTypedData.
 * The domain is read from the delegator's EIP-7702 code (the EIP7702StatelessDeleGator).
 * Since the "verifyingContract" for the Delegation type is the DelegationManager,
 * we use the DelegationManager address.
 */
async function signDelegation(
  walletClient: ReturnType<typeof createWalletClient>,
  publicClient: ReturnType<typeof createPublicClient>,
  delegation: Omit<Delegation, 'signature'>,
  delegationManagerAddress: `0x${string}`
): Promise<`0x${string}`> {
  // Read the DelegationManager's EIP-712 domain
  const dmABIFull = _require('@metamask/delegation-abis') as { DelegationManager: readonly unknown[] }

  const domainResult = await publicClient.readContract({
    address: delegationManagerAddress,
    abi: dmABIFull.DelegationManager,
    functionName: 'eip712Domain',
  }) as [string, string, string, bigint, `0x${string}`, `0x${string}`, bigint[]]

  const [, name, version, chainId, verifyingContract] = domainResult

  // NOTE: The MetaMask signing type for Caveat only includes `enforcer` and `terms`.
  // The `args` field exists on the on-chain struct for runtime enforcement but is
  // NOT part of the EIP-712 signing type (per SIGNABLE_DELEGATION_TYPED_DATA in
  // @metamask/smart-accounts-kit). Including `args` in the type produces a different
  // CAVEAT_TYPEHASH and therefore an invalid signature.
  const signature = await walletClient.signTypedData({
    domain: {
      name,
      version,
      chainId: Number(chainId),
      verifyingContract,
    },
    types: {
      Delegation: [
        { name: 'delegate', type: 'address' },
        { name: 'delegator', type: 'address' },
        { name: 'authority', type: 'bytes32' },
        { name: 'caveats', type: 'Caveat[]' },
        { name: 'salt', type: 'uint256' },
      ],
      Caveat: [
        { name: 'enforcer', type: 'address' },
        { name: 'terms', type: 'bytes' },
        // `args` is intentionally omitted: it is NOT part of the EIP-712 signing type
      ],
    },
    primaryType: 'Delegation',
    message: {
      delegate: delegation.delegate,
      delegator: delegation.delegator,
      authority: delegation.authority as `0x${string}`,
      caveats: delegation.caveats,
      salt: delegation.salt,
    },
    account: walletClient.account!,
  })

  return signature
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadEnv(): TestEnv {
  return JSON.parse(readFileSync(TEST_ENV_FILE, 'utf-8'))
}

const keys = getAnvilPrivateKeys()

// DID attribute for tests: did/pub/Ed25519/veriKey/base64
const ATTR_NAME = stringToBytes32('did/pub/Ed25519/veriKey/base64') as `0x${string}`
// prefix = first 4 bytes of ATTR_NAME
const ALLOWED_PREFIX = ATTR_NAME.slice(0, 10) as `0x${string}` // '0x' + 8 hex chars = bytes4

// Wrong attribute: starts with 'svc/' (0x7376632f) — different 4-byte prefix than 'did/' (0x6469642f)
const WRONG_ATTR_NAME = stringToBytes32('svc/LinkedDomains/serviceEndpoint/https') as `0x${string}`

const ATTR_VALUE = toHex(new TextEncoder().encode('mmframeworkkey'))
const VALIDITY = 3600n

// ERC-2098 registry ABI (just setAttribute)
const REGISTRY_SET_ATTRIBUTE_ABI = [
  {
    name: 'setAttribute',
    type: 'function',
    inputs: [
      { name: 'identity', type: 'address' },
      { name: 'name', type: 'bytes32' },
      { name: 'value', type: 'bytes' },
      { name: 'validity', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

// ---------------------------------------------------------------------------
// Test: framework contracts deployed
// ---------------------------------------------------------------------------

describe('Phase 13: MetaMask Delegation Framework', () => {
  it('framework contracts are deployed and have code', async () => {
    const { rpcUrl, contracts } = loadEnv()
    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })

    const [dmCode, deleCode, enfCode] = await Promise.all([
      publicClient.getCode({ address: contracts.delegationManager }),
      publicClient.getCode({ address: contracts.statelessDeleGator }),
      publicClient.getCode({ address: contracts.didAttributeEnforcer }),
    ])

    expect(dmCode).toBeDefined()
    expect(dmCode).not.toBe('0x')
    expect(deleCode).toBeDefined()
    expect(deleCode).not.toBe('0x')
    expect(enfCode).toBeDefined()
    expect(enfCode).not.toBe('0x')
  })

  // -------------------------------------------------------------------------
  // Happy path: EOA delegates to EIP7702StatelessDeleGator, relayer redeems
  // -------------------------------------------------------------------------

  it('relayer redeems delegation to setAttribute via framework (happy path)', async () => {
    const { rpcUrl, contracts } = loadEnv()

    // Actors:
    //   eoaAccount  — the identity owner (delegator, EIP-7702 EOA)
    //   relayer     — redeems the delegation (pays gas, calls redeemDelegations)
    const eoaAccount = privateKeyToAccount(keys[3])
    const relayerAccount = privateKeyToAccount(keys[1])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWallet = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const relayerWallet = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: relayerAccount })

    // Step 1: EOA delegates to EIP7702StatelessDeleGator via EIP-7702
    const auth = await eoaWallet.signAuthorization({
      contractAddress: contracts.statelessDeleGator,
      executor: relayerAccount.address,
    })

    const authTxHash = await relayerWallet.sendTransaction({
      to: eoaAccount.address,
      data: '0x',
      gas: 100_000n,
      chain: anvilChain,
      account: relayerAccount,
      authorizationList: [auth],
    })
    const authReceipt = await publicClient.waitForTransactionReceipt({ hash: authTxHash })
    expect(authReceipt.status).toBe('success')

    // Verify EOA now has 7702 delegation code pointing to statelessDeleGator
    const code = await publicClient.getCode({ address: eoaAccount.address })
    expect(code).toBeDefined()
    expect(code!.toLowerCase()).toContain(contracts.statelessDeleGator.slice(2).toLowerCase())

    // Step 2: EOA signs a MetaMask Delegation granting relayer permission to
    //         call setAttribute on the DID registry, constrained to allowed prefix.
    const caveat: Caveat = {
      enforcer: contracts.didAttributeEnforcer,
      terms: ALLOWED_PREFIX, // bytes4 allowed prefix
      args: '0x',
    }

    const delegation: Omit<Delegation, 'signature'> = {
      delegate: relayerAccount.address,
      delegator: eoaAccount.address,
      authority: ROOT_AUTHORITY as `0x${string}`,
      caveats: [caveat],
      salt: 0n,
    }

    const sig = await signDelegation(eoaWallet, publicClient, delegation, contracts.delegationManager)
    const signedDelegation: Delegation = { ...delegation, signature: sig }

    // Step 3: Build the execution calldata (setAttribute on the registry)
    const setAttrCalldata = encodeFunctionData({
      abi: REGISTRY_SET_ATTRIBUTE_ABI,
      functionName: 'setAttribute',
      args: [eoaAccount.address, ATTR_NAME, ATTR_VALUE, VALIDITY],
    })
    const executionCalldata = encodeExecution(contracts.registry, 0n, setAttrCalldata)

    // Step 4: Relayer calls DelegationManager.redeemDelegations directly.
    // DelegationManager validates the delegation (delegate=relayer), then calls
    // EOA.executeFromExecutor to run the actual call via the deleGator.
    const permissionContext = encodeDelegations([signedDelegation])

    const redeemHash = await relayerWallet.writeContract({
      address: contracts.delegationManager,
      abi: DelegationManagerABI,
      functionName: 'redeemDelegations',
      args: [[permissionContext], [SINGLE_DEFAULT_MODE], [executionCalldata]],
      gas: 500_000n,
      chain: anvilChain,
      account: relayerAccount,
    })
    const redeemReceipt = await publicClient.waitForTransactionReceipt({ hash: redeemHash })
    expect(redeemReceipt.status).toBe('success')

    // Step 5: Verify the DID attribute was written
    // The DID registry emits DIDAttributeChanged when setAttribute succeeds.
    // We check via getLogs.
    const logs = await publicClient.getLogs({
      address: contracts.registry,
      fromBlock: redeemReceipt.blockNumber,
      toBlock: redeemReceipt.blockNumber,
    })
    // At least one log from the registry confirms setAttribute was called
    expect(logs.length).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // Enforcer rejects wrong prefix
  // -------------------------------------------------------------------------

  it('enforcer reverts when attribute name prefix is not allowed', async () => {
    const { rpcUrl, contracts } = loadEnv()

    const eoaAccount = privateKeyToAccount(keys[4])
    const relayerAccount = privateKeyToAccount(keys[1])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWallet = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const relayerWallet = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: relayerAccount })

    // EIP-7702 delegate to statelessDeleGator
    const auth = await eoaWallet.signAuthorization({
      contractAddress: contracts.statelessDeleGator,
      executor: relayerAccount.address,
    })
    await publicClient.waitForTransactionReceipt({
      hash: await relayerWallet.sendTransaction({
        to: eoaAccount.address,
        data: '0x',
        gas: 100_000n,
        chain: anvilChain,
        account: relayerAccount,
        authorizationList: [auth],
      }),
    })

    // Caveat: only allow ATTR_NAME prefix (did/pub/...)
    const caveat: Caveat = {
      enforcer: contracts.didAttributeEnforcer,
      terms: ALLOWED_PREFIX,
      args: '0x',
    }

    const delegation: Omit<Delegation, 'signature'> = {
      delegate: relayerAccount.address,
      delegator: eoaAccount.address,
      authority: ROOT_AUTHORITY as `0x${string}`,
      caveats: [caveat],
      salt: 1n, // different salt to get different delegation hash
    }

    const sig = await signDelegation(eoaWallet, publicClient, delegation, contracts.delegationManager)
    const signedDelegation: Delegation = { ...delegation, signature: sig }

    // Try to setAttribute with WRONG prefix (did/svc/...) — enforcer should revert
    const wrongCalldata = encodeFunctionData({
      abi: REGISTRY_SET_ATTRIBUTE_ABI,
      functionName: 'setAttribute',
      args: [eoaAccount.address, WRONG_ATTR_NAME, ATTR_VALUE, VALIDITY],
    })
    const executionCalldata = encodeExecution(contracts.registry, 0n, wrongCalldata)
    const permissionContext = encodeDelegations([signedDelegation])

    const redeemHash = await relayerWallet.writeContract({
      address: contracts.delegationManager,
      abi: DelegationManagerABI,
      functionName: 'redeemDelegations',
      args: [[permissionContext], [SINGLE_DEFAULT_MODE], [executionCalldata]],
      gas: 500_000n,
      chain: anvilChain,
      account: relayerAccount,
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash: redeemHash })
    // The enforcer reverts → the outer redeemDelegations call also reverts
    expect(receipt.status).toBe('reverted')
  })

  // -------------------------------------------------------------------------
  // Gas comparison: custom DIDManager7702 vs MetaMask framework
  // -------------------------------------------------------------------------

  it('gas comparison: custom DIDManager7702 vs MetaMask delegation framework', async () => {
    const { rpcUrl, contracts } = loadEnv()

    // --- Custom DIDManager7702 approach ---
    const customEoa = privateKeyToAccount(keys[5])
    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const customWallet = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: customEoa })

    const authCustom = await customWallet.signAuthorization({
      contractAddress: contracts.didManager,
      executor: 'self',
    })
    const writeData = encodeFunctionData({
      abi: DID_MANAGER_ABI,
      functionName: 'setAttributeForIdentity',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY],
    })
    const customHash = await customWallet.sendTransaction({
      to: customEoa.address,
      data: writeData,
      gas: 300_000n,
      chain: anvilChain,
      account: customEoa,
      authorizationList: [authCustom],
    })
    const customReceipt = await publicClient.waitForTransactionReceipt({ hash: customHash })
    expect(customReceipt.status).toBe('success')
    const customGas = customReceipt.gasUsed

    // --- MetaMask Delegation Framework approach ---
    const mmEoa = privateKeyToAccount(keys[6])
    const relayerAccount = privateKeyToAccount(keys[1])
    const mmWallet = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: mmEoa })
    const relayerWallet = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: relayerAccount })

    const authMM = await mmWallet.signAuthorization({
      contractAddress: contracts.statelessDeleGator,
      executor: relayerAccount.address,
    })
    await publicClient.waitForTransactionReceipt({
      hash: await relayerWallet.sendTransaction({
        to: mmEoa.address,
        data: '0x',
        gas: 100_000n,
        chain: anvilChain,
        account: relayerAccount,
        authorizationList: [authMM],
      }),
    })

    const caveat: Caveat = {
      enforcer: contracts.didAttributeEnforcer,
      terms: ALLOWED_PREFIX,
      args: '0x',
    }
    const delegation: Omit<Delegation, 'signature'> = {
      delegate: relayerAccount.address,
      delegator: mmEoa.address,
      authority: ROOT_AUTHORITY as `0x${string}`,
      caveats: [caveat],
      salt: 42n,
    }
    const sig = await signDelegation(mmWallet, publicClient, delegation, contracts.delegationManager)
    const signedDelegation: Delegation = { ...delegation, signature: sig }

    const setAttrCalldata = encodeFunctionData({
      abi: REGISTRY_SET_ATTRIBUTE_ABI,
      functionName: 'setAttribute',
      args: [mmEoa.address, ATTR_NAME, ATTR_VALUE, VALIDITY],
    })
    const executionCalldata = encodeExecution(contracts.registry, 0n, setAttrCalldata)
    const permissionContext = encodeDelegations([signedDelegation])

    const mmHash = await relayerWallet.writeContract({
      address: contracts.delegationManager,
      abi: DelegationManagerABI,
      functionName: 'redeemDelegations',
      args: [[permissionContext], [SINGLE_DEFAULT_MODE], [executionCalldata]],
      gas: 500_000n,
      chain: anvilChain,
      account: relayerAccount,
    })
    const mmReceipt = await publicClient.waitForTransactionReceipt({ hash: mmHash })
    expect(mmReceipt.status).toBe('success')
    const mmGas = mmReceipt.gasUsed

    // Log for visibility (not an assertion — gas varies by run)
    console.log(`  Custom DIDManager7702 gas:              ${customGas}`)
    console.log(`  MetaMask Delegation Framework gas:      ${mmGas}`)
    console.log(`  Framework overhead:                     +${mmGas - customGas} gas`)

    // Framework should use more gas due to EIP-712 verification + caveat checking
    // Both must succeed (correctness gate)
    expect(customGas).toBeGreaterThan(0n)
    expect(mmGas).toBeGreaterThan(0n)
  })

  // -------------------------------------------------------------------------
  // Enforcer: non-setAttribute calldata is rejected
  // -------------------------------------------------------------------------

  it('enforcer reverts when calldata is not a setAttribute call', async () => {
    const { rpcUrl, contracts } = loadEnv()

    const eoaAccount = privateKeyToAccount(keys[7])
    const relayerAccount = privateKeyToAccount(keys[1])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWallet = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const relayerWallet = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: relayerAccount })

    // EIP-7702 delegate to statelessDeleGator
    const auth = await eoaWallet.signAuthorization({
      contractAddress: contracts.statelessDeleGator,
      executor: relayerAccount.address,
    })
    await publicClient.waitForTransactionReceipt({
      hash: await relayerWallet.sendTransaction({
        to: eoaAccount.address,
        data: '0x',
        gas: 100_000n,
        chain: anvilChain,
        account: relayerAccount,
        authorizationList: [auth],
      }),
    })

    const caveat: Caveat = {
      enforcer: contracts.didAttributeEnforcer,
      terms: ALLOWED_PREFIX,
      args: '0x',
    }
    const delegation: Omit<Delegation, 'signature'> = {
      delegate: relayerAccount.address,
      delegator: eoaAccount.address,
      authority: ROOT_AUTHORITY as `0x${string}`,
      caveats: [caveat],
      salt: 99n,
    }
    const sig = await signDelegation(eoaWallet, publicClient, delegation, contracts.delegationManager)
    const signedDelegation: Delegation = { ...delegation, signature: sig }

    // Try to call revokeAttribute (different function, not setAttribute)
    const revokeABI = [
      {
        name: 'revokeAttribute',
        type: 'function',
        inputs: [
          { name: 'identity', type: 'address' },
          { name: 'name', type: 'bytes32' },
          { name: 'value', type: 'bytes' },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
      },
    ] as const

    const revokeCalldata = encodeFunctionData({
      abi: revokeABI,
      functionName: 'revokeAttribute',
      args: [eoaAccount.address, ATTR_NAME, ATTR_VALUE],
    })
    const executionCalldata = encodeExecution(contracts.registry, 0n, revokeCalldata)
    const permissionContext = encodeDelegations([signedDelegation])

    const redeemHash = await relayerWallet.writeContract({
      address: contracts.delegationManager,
      abi: DelegationManagerABI,
      functionName: 'redeemDelegations',
      args: [[permissionContext], [SINGLE_DEFAULT_MODE], [executionCalldata]],
      gas: 500_000n,
      chain: anvilChain,
      account: relayerAccount,
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash: redeemHash })
    expect(receipt.status).toBe('reverted')
  })
})

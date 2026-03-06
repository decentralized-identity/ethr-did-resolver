// test/meta-tx-updates.test.ts
// Pattern: Gasless DID updates via EIP-712 signed meta-transactions.
//
// The EOA (identity owner) signs an EIP-712 typed-data intent off-chain.
// A relayer submits the transaction and pays all gas.
//
// For the first use, the relayer includes the EOA's EIP-7702 authorization
// tuple in the same type-4 tx, atomically delegating + updating in one tx.

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
import { TEST_ENV_FILE } from './globalSetup.js'
import { getAnvilPrivateKeys } from '../src/utils/anvil.js'
import { META_TX_DID_MANAGER_ABI } from '../src/utils/abis.js'

type TestEnv = {
  rpcUrl: string
  chainId: number
  contracts: {
    registry: `0x${string}`
    metaTxDidManager: `0x${string}`
    [key: string]: `0x${string}` | number
  }
}

function loadEnv(): TestEnv {
  return JSON.parse(readFileSync(TEST_ENV_FILE, 'utf-8'))
}

const ATTR_NAME = stringToBytes32('did/pub/Ed25519/veriKey/base64') as `0x${string}`
const ATTR_VALUE = toHex(new TextEncoder().encode('metatxkey'))
const VALIDITY = 3600n

/** Helper: send tx to EOA and return success + hash */
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

describe('MetaTxDIDManager7702', () => {
  it('setAttribute gasless: relayer sets a DID attribute for an EOA', async () => {
    const { rpcUrl, chainId, contracts } = loadEnv()
    const keys = getAnvilPrivateKeys()

    // keys[1] = EOA (identity owner), keys[0] = relayer (pays gas)
    const eoaAccount = privateKeyToAccount(keys[1])
    const relayerAccount = privateKeyToAccount(keys[0])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const relayerWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: relayerAccount })

    // EOA signs EIP-7702 auth tuple (relayer will include it in the tx)
    const authorization = await eoaWalletClient.signAuthorization({
      contractAddress: contracts.metaTxDidManager,
      executor: relayerAccount.address,
    })

    // EOA signs EIP-712 SetAttribute intent (no tx sent)
    const signature = await eoaWalletClient.signTypedData({
      account: eoaAccount,
      domain: {
        name: 'MetaTxDIDManager7702',
        version: '1',
        chainId,
        verifyingContract: eoaAccount.address,
      },
      types: {
        SetAttribute: [
          { name: 'registry', type: 'address' },
          { name: 'name', type: 'bytes32' },
          { name: 'value', type: 'bytes' },
          { name: 'validity', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
        ],
      },
      primaryType: 'SetAttribute',
      message: {
        registry: contracts.registry,
        name: ATTR_NAME,
        value: ATTR_VALUE,
        validity: VALIDITY,
        nonce: 0n,
      },
    })

    // Relayer submits ONE tx: delegation + setAttribute atomically
    const callData = encodeFunctionData({
      abi: META_TX_DID_MANAGER_ABI,
      functionName: 'setAttribute',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY, signature],
    })

    const { success } = await sendToEoa(relayerWalletClient, publicClient, {
      to: eoaAccount.address,
      data: callData,
      authorizationList: [authorization],
    })
    expect(success).toBe(true)

    // Nonce should be 1 now
    const nonceAfter = await publicClient.readContract({
      address: eoaAccount.address,
      abi: META_TX_DID_MANAGER_ABI,
      functionName: 'getNonce',
    }) as bigint
    expect(nonceAfter).toBe(1n)
  })

  it('setAttribute replay protection: reusing the same signature reverts', async () => {
    const { rpcUrl, chainId, contracts } = loadEnv()
    const keys = getAnvilPrivateKeys()

    const eoaAccount = privateKeyToAccount(keys[1])
    const relayerAccount = privateKeyToAccount(keys[0])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const relayerWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: relayerAccount })

    const authorization = await eoaWalletClient.signAuthorization({
      contractAddress: contracts.metaTxDidManager,
      executor: relayerAccount.address,
    })

    // Sign with nonce=0
    const signature = await eoaWalletClient.signTypedData({
      account: eoaAccount,
      domain: { name: 'MetaTxDIDManager7702', version: '1', chainId, verifyingContract: eoaAccount.address },
      types: {
        SetAttribute: [
          { name: 'registry', type: 'address' },
          { name: 'name', type: 'bytes32' },
          { name: 'value', type: 'bytes' },
          { name: 'validity', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
        ],
      },
      primaryType: 'SetAttribute',
      message: { registry: contracts.registry, name: ATTR_NAME, value: ATTR_VALUE, validity: VALIDITY, nonce: 0n },
    })

    const callData = encodeFunctionData({
      abi: META_TX_DID_MANAGER_ABI,
      functionName: 'setAttribute',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY, signature],
    })

    // First call — sets delegation + updates DID attribute (nonce 0 → 1)
    const { success: first } = await sendToEoa(relayerWalletClient, publicClient, {
      to: eoaAccount.address,
      data: callData,
      authorizationList: [authorization],
    })
    expect(first).toBe(true)

    // Second call with same sig — nonce is now 1, signature was for nonce=0 → revert
    const { success: second } = await sendToEoa(relayerWalletClient, publicClient, {
      to: eoaAccount.address,
      data: callData,
    })
    expect(second).toBe(false)
  })

  it('setBatchAttributes gasless: relayer sets multiple attributes in one tx', async () => {
    const { rpcUrl, chainId, contracts } = loadEnv()
    const keys = getAnvilPrivateKeys()

    const eoaAccount = privateKeyToAccount(keys[1])
    const relayerAccount = privateKeyToAccount(keys[0])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const relayerWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: relayerAccount })

    const authorization = await eoaWalletClient.signAuthorization({
      contractAddress: contracts.metaTxDidManager,
      executor: relayerAccount.address,
    })

    const updates = [
      {
        name: stringToBytes32('did/pub/Ed25519/veriKey/base64') as `0x${string}`,
        value: toHex(new TextEncoder().encode('batchkey1')) as `0x${string}`,
        validity: 3600n,
      },
      {
        name: stringToBytes32('did/pub/Secp256k1/veriKey/base64') as `0x${string}`,
        value: toHex(new TextEncoder().encode('batchkey2')) as `0x${string}`,
        validity: 7200n,
      },
    ]

    const signature = await eoaWalletClient.signTypedData({
      account: eoaAccount,
      domain: { name: 'MetaTxDIDManager7702', version: '1', chainId, verifyingContract: eoaAccount.address },
      types: {
        SetBatchAttributes: [
          { name: 'registry', type: 'address' },
          { name: 'updates', type: 'AttributeUpdate[]' },
          { name: 'nonce', type: 'uint256' },
        ],
        AttributeUpdate: [
          { name: 'name', type: 'bytes32' },
          { name: 'value', type: 'bytes' },
          { name: 'validity', type: 'uint256' },
        ],
      },
      primaryType: 'SetBatchAttributes',
      message: { registry: contracts.registry, updates, nonce: 0n },
    })

    const callData = encodeFunctionData({
      abi: META_TX_DID_MANAGER_ABI,
      functionName: 'setBatchAttributes',
      args: [contracts.registry, updates, signature],
    })

    const { success } = await sendToEoa(relayerWalletClient, publicClient, {
      to: eoaAccount.address,
      data: callData,
      authorizationList: [authorization],
    })
    expect(success).toBe(true)

    // Nonce should be 1
    const nonceAfter = await publicClient.readContract({
      address: eoaAccount.address,
      abi: META_TX_DID_MANAGER_ABI,
      functionName: 'getNonce',
    }) as bigint
    expect(nonceAfter).toBe(1n)
  })

  it('setBatchAttributes with empty updates array is a no-op (succeeds)', async () => {
    const { rpcUrl, chainId, contracts } = loadEnv()
    const keys = getAnvilPrivateKeys()

    const eoaAccount = privateKeyToAccount(keys[1])
    const relayerAccount = privateKeyToAccount(keys[0])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const relayerWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: relayerAccount })

    const authorization = await eoaWalletClient.signAuthorization({
      contractAddress: contracts.metaTxDidManager,
      executor: relayerAccount.address,
    })

    const signature = await eoaWalletClient.signTypedData({
      account: eoaAccount,
      domain: { name: 'MetaTxDIDManager7702', version: '1', chainId, verifyingContract: eoaAccount.address },
      types: {
        SetBatchAttributes: [
          { name: 'registry', type: 'address' },
          { name: 'updates', type: 'AttributeUpdate[]' },
          { name: 'nonce', type: 'uint256' },
        ],
        AttributeUpdate: [
          { name: 'name', type: 'bytes32' },
          { name: 'value', type: 'bytes' },
          { name: 'validity', type: 'uint256' },
        ],
      },
      primaryType: 'SetBatchAttributes',
      message: { registry: contracts.registry, updates: [], nonce: 0n },
    })

    const callData = encodeFunctionData({
      abi: META_TX_DID_MANAGER_ABI,
      functionName: 'setBatchAttributes',
      args: [contracts.registry, [], signature],
    })

    const { success } = await sendToEoa(relayerWalletClient, publicClient, {
      to: eoaAccount.address,
      data: callData,
      authorizationList: [authorization],
    })
    expect(success).toBe(true)
  })

  it('non-EOA signature is rejected', async () => {
    const { rpcUrl, chainId, contracts } = loadEnv()
    const keys = getAnvilPrivateKeys()

    const eoaAccount = privateKeyToAccount(keys[1])
    const relayerAccount = privateKeyToAccount(keys[0])
    const wrongSigner = privateKeyToAccount(keys[9]) // NOT the EOA

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const relayerWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: relayerAccount })
    const wrongSignerWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: wrongSigner })

    // Set up delegation only
    const authorization = await eoaWalletClient.signAuthorization({
      contractAddress: contracts.metaTxDidManager,
      executor: relayerAccount.address,
    })

    // Wrong signer signs the digest (not the EOA)
    const wrongSignature = await wrongSignerWalletClient.signTypedData({
      account: wrongSigner,
      domain: { name: 'MetaTxDIDManager7702', version: '1', chainId, verifyingContract: eoaAccount.address },
      types: {
        SetAttribute: [
          { name: 'registry', type: 'address' },
          { name: 'name', type: 'bytes32' },
          { name: 'value', type: 'bytes' },
          { name: 'validity', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
        ],
      },
      primaryType: 'SetAttribute',
      message: { registry: contracts.registry, name: ATTR_NAME, value: ATTR_VALUE, validity: VALIDITY, nonce: 0n },
    })

    const callData = encodeFunctionData({
      abi: META_TX_DID_MANAGER_ABI,
      functionName: 'setAttribute',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY, wrongSignature],
    })

    const { success } = await sendToEoa(relayerWalletClient, publicClient, {
      to: eoaAccount.address,
      data: callData,
      authorizationList: [authorization],
    })
    expect(success).toBe(false) // "invalid signature" — recovered != address(this)
  })

  it('nonce increments after each setAttribute', async () => {
    const { rpcUrl, chainId, contracts } = loadEnv()
    const keys = getAnvilPrivateKeys()

    const eoaAccount = privateKeyToAccount(keys[1])
    const relayerAccount = privateKeyToAccount(keys[0])

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
    const eoaWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: eoaAccount })
    const relayerWalletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account: relayerAccount })

    // First update: include delegation in tx
    const authorization = await eoaWalletClient.signAuthorization({
      contractAddress: contracts.metaTxDidManager,
      executor: relayerAccount.address,
    })

    const sig0 = await eoaWalletClient.signTypedData({
      account: eoaAccount,
      domain: { name: 'MetaTxDIDManager7702', version: '1', chainId, verifyingContract: eoaAccount.address },
      types: {
        SetAttribute: [
          { name: 'registry', type: 'address' },
          { name: 'name', type: 'bytes32' },
          { name: 'value', type: 'bytes' },
          { name: 'validity', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
        ],
      },
      primaryType: 'SetAttribute',
      message: { registry: contracts.registry, name: ATTR_NAME, value: ATTR_VALUE, validity: VALIDITY, nonce: 0n },
    })

    const callData0 = encodeFunctionData({
      abi: META_TX_DID_MANAGER_ABI,
      functionName: 'setAttribute',
      args: [contracts.registry, ATTR_NAME, ATTR_VALUE, VALIDITY, sig0],
    })

    const { success: first } = await sendToEoa(relayerWalletClient, publicClient, {
      to: eoaAccount.address,
      data: callData0,
      authorizationList: [authorization],
    })
    expect(first).toBe(true)

    // Nonce should be 1
    const nonce1 = await publicClient.readContract({
      address: eoaAccount.address,
      abi: META_TX_DID_MANAGER_ABI,
      functionName: 'getNonce',
    }) as bigint
    expect(nonce1).toBe(1n)

    // Second update: sign with nonce=1
    const sig1 = await eoaWalletClient.signTypedData({
      account: eoaAccount,
      domain: { name: 'MetaTxDIDManager7702', version: '1', chainId, verifyingContract: eoaAccount.address },
      types: {
        SetAttribute: [
          { name: 'registry', type: 'address' },
          { name: 'name', type: 'bytes32' },
          { name: 'value', type: 'bytes' },
          { name: 'validity', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
        ],
      },
      primaryType: 'SetAttribute',
      message: {
        registry: contracts.registry,
        name: ATTR_NAME,
        value: toHex(new TextEncoder().encode('metatxkey2')),
        validity: VALIDITY,
        nonce: 1n,
      },
    })

    const callData1 = encodeFunctionData({
      abi: META_TX_DID_MANAGER_ABI,
      functionName: 'setAttribute',
      args: [contracts.registry, ATTR_NAME, toHex(new TextEncoder().encode('metatxkey2')), VALIDITY, sig1],
    })

    const { success: second } = await sendToEoa(relayerWalletClient, publicClient, {
      to: eoaAccount.address,
      data: callData1,
    })
    expect(second).toBe(true)

    // Nonce should be 2
    const nonce2 = await publicClient.readContract({
      address: eoaAccount.address,
      abi: META_TX_DID_MANAGER_ABI,
      functionName: 'getNonce',
    }) as bigint
    expect(nonce2).toBe(2n)
  })
})

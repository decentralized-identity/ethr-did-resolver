// src/patterns/cross-chain-sync.ts
// Pattern 7: Cross-chain DID sync via EIP-7702
//
// The key insight: the EOA may have zero ETH on Chain B. With EIP-7702, the relayer
// can include the EOA's signed authorization tuple in its own type-4 tx — no ETH
// needed from the EOA on that chain, ever.
//
// Full off-chain flow (EOA never sends a tx on Chain B):
//   1. EOA signs an EIP-7702 authorization tuple pointing to CrossChainDIDManager7702
//   2. EOA signs an EIP-712 UpdateAuthorization for the desired DID attribute
//   3. Relayer bundles both into a single type-4 tx: authorizationList=[eoaAuth] +
//      calldata=setAttributeCrossChain(...). This atomically delegates AND updates.
//   4. For subsequent updates (delegation already set), the relayer just calls
//      setAttributeCrossChain without re-authorizing.
//
// Replay protection: per-EOA nonce (crossChainNonce in EOA storage) incremented each use.
//
// EIP-712 domain:
//   name    = "CrossChainDIDManager7702"
//   version = "1"
//   chainId = block.chainid  (chain-specific — prevents cross-chain replay)
//   verifyingContract = EOA address  (address(this) in the delegation context)

import {
  type WalletClient,
  type PublicClient,
  encodeFunctionData,
  toHex,
  type Hash,
  type SignAuthorizationReturnType,
} from 'viem'
import { CROSS_CHAIN_DID_MANAGER_ABI } from '../utils/abis.js'

export type CrossChainSetupParams = {
  crossChainDidManagerAddress: `0x${string}`
}

export type CrossChainUpdateParams = {
  registry: `0x${string}`
  eoaAddress: `0x${string}`
  attrName: `0x${string}` // bytes32
  attrValue: Uint8Array | `0x${string}`
  validity: bigint
  signature: `0x${string}` // EOA's EIP-712 signature
  /** Optional: include EOA authorization tuple to set/refresh delegation atomically */
  authorization?: SignAuthorizationReturnType
}

/**
 * Step 1 (off-chain): EOA signs an EIP-7702 authorization tuple for CrossChainDIDManager7702.
 * The EOA does NOT send any tx — the relayer will include this in its own tx.
 *
 * IMPORTANT: pass `relayerAddress` so viem does NOT add 1 to the EOA nonce. The relayer
 * (not the EOA) pays gas, so the EOA's nonce is not consumed by this tx.
 */
export async function signCrossChainAuthorization(
  eoaWalletClient: WalletClient,
  params: CrossChainSetupParams & { relayerAddress: `0x${string}` }
): Promise<SignAuthorizationReturnType> {
  return eoaWalletClient.signAuthorization({
    contractAddress: params.crossChainDidManagerAddress,
    executor: params.relayerAddress,
    account: eoaWalletClient.account!,
  })
}

/**
 * Step 2 (off-chain): EOA signs an EIP-712 UpdateAuthorization for a specific update.
 * Returns the 65-byte ECDSA signature.
 */
export async function signCrossChainUpdate(
  eoaWalletClient: WalletClient,
  params: {
    eoaAddress: `0x${string}`
    registry: `0x${string}`
    attrName: `0x${string}`
    attrValue: Uint8Array | `0x${string}`
    validity: bigint
    nonce: bigint
    chainId: number
  }
): Promise<`0x${string}`> {
  const { eoaAddress, registry, attrName, attrValue, validity, nonce, chainId } = params
  const valueHex = attrValue instanceof Uint8Array ? toHex(attrValue) : attrValue

  return eoaWalletClient.signTypedData({
    account: eoaWalletClient.account!,
    domain: {
      name: 'CrossChainDIDManager7702',
      version: '1',
      chainId,
      verifyingContract: eoaAddress, // address(this) == EOA in the delegation context
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
      registry,
      name: attrName,
      value: valueHex,
      validity,
      nonce,
    },
  })
}

/**
 * Step 3: Broadcaster submits the signed update to Chain B (pays gas).
 *
 * If `authorization` is provided, the delegation is set (or refreshed) atomically
 * in the same tx — no prior EOA tx needed on this chain.
 *
 * For subsequent updates the broadcaster omits `authorization` (delegation already set).
 */
export async function broadcasterSubmitUpdate(
  broadcasterWalletClient: WalletClient,
  publicClient: PublicClient,
  params: CrossChainUpdateParams
): Promise<Hash> {
  const { registry, eoaAddress, attrName, attrValue, validity, signature, authorization } = params
  const valueHex = attrValue instanceof Uint8Array ? toHex(attrValue) : attrValue

  const data = encodeFunctionData({
    abi: CROSS_CHAIN_DID_MANAGER_ABI,
    functionName: 'setAttributeCrossChain',
    args: [registry, attrName, valueHex, validity, signature],
  })

  const txParams: Parameters<typeof broadcasterWalletClient.sendTransaction>[0] = {
    to: eoaAddress,
    data,
    gas: 300_000n,
    chain: broadcasterWalletClient.chain,
    account: broadcasterWalletClient.account!,
  }

  if (authorization) {
    txParams.authorizationList = [authorization]
  }

  const hash = await broadcasterWalletClient.sendTransaction(txParams)

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') {
    throw new Error(`broadcasterSubmitUpdate reverted (txHash: ${hash})`)
  }
  return hash
}

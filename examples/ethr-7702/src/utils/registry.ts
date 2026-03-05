// src/utils/registry.ts
// Deployment helpers for ERC-1056 EthereumDIDRegistry

import { EthereumDIDRegistry } from 'ethr-did-resolver'
import { type PublicClient, type WalletClient } from 'viem'

export type RegistryDeployment = {
  address: `0x${string}`
  abi: typeof EthereumDIDRegistry.abi
}

export async function deployRegistry(
  walletClient: WalletClient,
  publicClient: PublicClient
): Promise<RegistryDeployment> {
  const [account] = await walletClient.getAddresses()

  const hash = await walletClient.deployContract({
    abi: EthereumDIDRegistry.abi,
    bytecode: EthereumDIDRegistry.bytecode as `0x${string}`,
    account,
    chain: walletClient.chain,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })

  if (!receipt.contractAddress) {
    throw new Error('Registry deployment failed: no contract address in receipt')
  }

  return {
    address: receipt.contractAddress,
    abi: EthereumDIDRegistry.abi,
  }
}

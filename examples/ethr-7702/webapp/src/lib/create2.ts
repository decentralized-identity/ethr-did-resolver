// Deterministic contract deployment via the canonical CREATE2 deployer.
//
// Every delegation manager is deployed through the well-known minimal factory
// at 0x4e59b44847b379578588920cA78FbF26c0B4956C. The factory runs the same
// 69-byte runtime on every chain it is deployed to (Sepolia, Gnosis, mainnet),
// so the CREATE2-derived address for a given (salt, init code) is IDENTICAL on
// all of them — and, crucially, does not depend on the chain ID. On local Anvil
// we inject the same runtime with anvil_setCode, so local addresses match the
// testnets exactly.
//
// Factory interface (no selector): calldata = salt (32 bytes) || init code.
// Address derivation (EIP-1014): keccak256(0xff ++ factory ++ salt ++
// keccak256(initCode))[12:].
//
// "Is it deployed?" is therefore a cheap eth_getCode length check against a
// precomputed address — no bookkeeping, no per-network address files.

import { getCreate2Address, keccak256, toBytes, concat, type Address, type Hash, type Hex, type PublicClient, type WalletClient } from 'viem'

/** Canonical minimal CREATE2 deployer, live on Sepolia/Gnosis/mainnet. */
export const CREATE2_FACTORY = '0x4e59b44847b379578588920cA78FbF26c0B4956C' as const

/** The 69-byte factory runtime, identical on every chain it is deployed to. */
export const CREATE2_FACTORY_RUNTIME =
  '0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3' as const

/** Deterministic salt for a manager: keccak256("ethr-7702.<ContractName>"). */
export function managerSalt(contractName: string): Hex {
  return keccak256(toBytes(`ethr-7702.${contractName}`))
}

/** Deterministic CREATE2 address for a manager. Chain-independent. */
export function create2Address(contractName: string, initCode: Hex): Address {
  return getCreate2Address({
    from: CREATE2_FACTORY,
    salt: managerSalt(contractName),
    bytecodeHash: keccak256(toBytes(initCode)),
  })
}

/** True if a contract already exists at `address`. */
export async function isDeployed(publicClient: PublicClient, address: Address): Promise<boolean> {
  const code = await publicClient.getCode({ address })
  return code !== undefined && code !== '0x'
}

/**
 * Ensure the CREATE2 factory exists. On local Anvil, inject the canonical
 * runtime with anvil_setCode (a raw JSON-RPC call — not part of viem's public
 * RPC method union); on real networks it is already live.
 * Returns true on local, false on a network that already has the factory.
 */
export async function ensureFactory(
  publicClient: PublicClient,
  rpcUrl: string
): Promise<boolean> {
  if (await isDeployed(publicClient, CREATE2_FACTORY)) return false
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'anvil_setCode',
      params: [CREATE2_FACTORY, CREATE2_FACTORY_RUNTIME],
    }),
  })
  const json = (await res.json().catch(() => null)) as { error?: { message: string } } | null
  if (!res.ok || json?.error) {
    throw new Error(
      `CREATE2 factory not deployed on this network (${CREATE2_FACTORY}). ` +
        'Switch to Local Anvil mode or use a network with the factory.'
    )
  }
  return true
}

/**
 * Deploy a manager through the CREATE2 factory if (and only if) it is missing.
 * Idempotent: if the deterministic address already has code, nothing is sent.
 * Returns the deterministic address either way.
 */
export async function deployViaCreate2(
  walletClient: WalletClient,
  publicClient: PublicClient,
  contractName: string,
  initCode: Hex,
  rpcUrl: string
): Promise<Address> {
  const address = create2Address(contractName, initCode)
  if (await isDeployed(publicClient, address)) return address

  await ensureFactory(publicClient, rpcUrl)

  const data = concat([managerSalt(contractName), initCode]) as Hex
  const hash: Hash = await walletClient.sendTransaction({
    to: CREATE2_FACTORY,
    data,
    chain: walletClient.chain,
    account: walletClient.account!,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') {
    throw new Error(`CREATE2 deploy of ${contractName} reverted (factory call failed)`)
  }
  return address
}

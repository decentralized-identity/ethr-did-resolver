import { concat, keccak256, SigningKey, toBeHex, zeroPadValue } from 'ethers'
import type { BytesLike, JsonRpcSigner, Provider, Signature } from 'ethers'
import hre from 'hardhat'

import { EthereumDIDRegistry__factory } from '../../typechain-types/index.js'
import type { EthereumDIDRegistry } from '../../typechain-types/index.js'

/**
 * Connects to the local EDR (hardhat) network via hre.network.create(), deploys
 * the registry through the generated typed factory, and hands back the harness
 * every ported test file needs: the typed contract, its address, the provider
 * (ethers.provider), and the six hardhat accounts used by the legacy suite
 * (identity, identity2, delegate, delegate2, delegate3, badBoy — indices 0..5).
 */
export async function deployRegistry(): Promise<{
  registry: EthereumDIDRegistry
  registryAddress: string
  provider: Provider
  signers: JsonRpcSigner[]
}> {
  const runtime = (await hre.network.create()) as unknown as {
    ethers: { getSigners: () => Promise<JsonRpcSigner[]>; provider: Provider }
  }
  const { ethers } = runtime
  const allSigners = await ethers.getSigners()
  const signers = allSigners.slice(0, 6) as JsonRpcSigner[]
  const registry = await (await new EthereumDIDRegistry__factory(signers[0]).deploy()).waitForDeployment()
  const registryAddress = await registry.getAddress()
  return { registry, registryAddress, provider: ethers.provider, signers }
}

/**
 * ERC-1056 meta-transaction signing, ported faithfully from the legacy
 * ethers-v5 helper (test/registry.test.ts). Signs the contract's personal-sign
 * style payload `0x19 0x00 <registry> <nonce> <identity> <data>` with a fixed
 * test key, using the ethers v6 signing API. The recovered address must equal
 * `identityOwner(identity)` for the `*Signed` contract functions to accept it.
 *
 * `nonce` defaults to the registry's current nonce for `signerAddress`; pass it
 * explicitly to craft a payload that will be rejected as bad_signature.
 */
export async function signData(
  registry: EthereumDIDRegistry,
  registryAddress: string,
  identity: string,
  signerAddress: string,
  privateKeyBytes: Uint8Array,
  dataBytes: BytesLike,
  nonce?: number
): Promise<Signature> {
  const _nonce = nonce ?? Number(await registry.nonce(signerAddress))
  const dataToSign = concat(['0x1900', registryAddress, zeroPadValue(toBeHex(_nonce), 32), identity, dataBytes])
  const hash = keccak256(dataToSign)
  return new SigningKey(privateKeyBytes).sign(hash)
}

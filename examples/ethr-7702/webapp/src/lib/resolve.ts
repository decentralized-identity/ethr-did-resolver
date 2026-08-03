// Browser-side did:ethr resolution using ethr-did-resolver (ethers v6).
//
// ethr-did-resolver works in the browser with a CORS-friendly public RPC URL.
// The resolver reads ERC-1056 events (eth_getLogs) + does eth_call against the
// registry, so it needs only a read RPC endpoint — no server required.

import { Resolver } from 'did-resolver'
import { getResolver } from 'ethr-did-resolver'
import type { NetworkConfig } from '../config/chains'

export type DidDoc = {
  id: string
  [key: string]: unknown
}

export function makeDidResolver(network: NetworkConfig) {
  const registry = network.registry as string | undefined
  const providerConfig = {
    networks: [
      {
        name: network.didNetworkName,
        chainId: network.chain.id,
        rpcUrl: network.resolverRpcUrl,
        ...(registry ? { registry } : {}),
      },
    ],
  }
  return new Resolver(getResolver(providerConfig))
}

/**
 * Resolve a DID and throw if resolution failed.
 * network: used to construct `did:ethr:<name>:0x<address>`.
 */
export async function resolveDid(network: NetworkConfig, address: string): Promise<DidDoc> {
  const resolver = makeDidResolver(network)
  const did = `did:ethr:${network.didNetworkName}:${address}`
  const result = await resolver.resolve(did)
  if (result.didResolutionMetadata.error || !result.didDocument) {
    throw new Error(
      `DID resolution failed (${did}): ${result.didResolutionMetadata.error ?? 'no document'}`
    )
  }
  return result.didDocument as DidDoc
}

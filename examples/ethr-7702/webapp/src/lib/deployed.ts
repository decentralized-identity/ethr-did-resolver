// Manager address types.
//
// Addresses are no longer read from a committed file — every manager is
// deployed through the canonical CREATE2 factory (see lib/create2.ts, lib/deploy.ts),
// so its address is deterministic and chain-independent. There is nothing to
// load: `deterministicManagerAddresses()` computes them from the artifact
// bytecode, and `eth_getCode` tells you whether they actually exist yet on the
// current network.

export type ManagerAddresses = {
  didManager: `0x${string}`
  policyDidManager: `0x${string}`
  multiSigDidManager: `0x${string}`
  revocationDidManager: `0x${string}`
  crossChainDidManager: `0x${string}`
  metaTxDidManager: `0x${string}`
  expiringDidManager: `0x${string}`
}

export type ManagerKey = keyof ManagerAddresses

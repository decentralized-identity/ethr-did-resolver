// src/utils/eip712.ts
// Shared EIP-712 domain builder for the delegation managers.
//
// Every manager uses the same domain shape:
//   name = "<ManagerName>"  version = "1"  chainId = block.chainid
//   verifyingContract = address(this)  (= the delegating EOA at call time)

export function managerDomain(
  managerName: string,
  chainId: number,
  verifyingContract: `0x${string}`
) {
  return {
    name: managerName,
    version: '1',
    chainId,
    verifyingContract,
  }
}

# Changelog

## [1.1.0] — Phase 9 — Part 2 Article

### Added
- `article/eip-7702-did-ethr-part2.md` — technical article covering:
  - Patterns 4–7 with full contract and TypeScript code
  - Gas optimization analysis (baseline costs + optimization opportunities)
  - Re-entrancy and storage collision audit across all contracts
  - Authorization tuple lifecycle (valid states, revocation flows, nonce rules)
  - Key compromise response playbook (4 scenarios: session key, multisig, EOA key, timelock)
  - Summary table for all 8 patterns

## [1.0.0] — Phase 8 — Part 2: Advanced Patterns (Patterns 4–7)

### Added
- `contracts/MultiSigDIDManager7702.sol` — M-of-N co-signer approval for DID updates
  - `configure([signers], threshold)` — owner-only signer set configuration
  - `setAttributeWithMultiSig(...)` — verifies sorted ECDSA signatures, enforces threshold
  - EIP-191 digest with identity + registry + nonce binding; replay protection via nonce
- `contracts/TimelockDIDManager7702.sol` — mandatory observation window before attribute takes effect
  - `configure(delay)`, `propose(...)`, `execute(proposalId)`, `cancel(proposalId)`
  - Anyone can execute after delay; only owner can cancel
- `contracts/RevocationDIDManager7702.sol` — dual revocation: ERC-1056 attribute expiry + credential registry
  - `revokeAttributeForIdentity(...)` — calls `registry.revokeAttribute` (sets validTo=0)
  - `revokeCredential(credentialId)` — stores revocation in EOA storage
  - `isRevoked(credentialId)` — public view; verifiers can query directly
- `contracts/CrossChainDIDManager7702.sol` — EOA-signed EIP-712 updates, relayer-submitted on any chain
  - `setAttributeCrossChain(...)` — verifies EIP-712 signature (chain + EOA bound), increments nonce
  - `crossChainNonce` — sequential replay protection stored in EOA storage
- `src/utils/abis.ts` — ABI exports for all four new contracts
- `src/deploy.ts` — deploys all Part 2 contracts; updated `DeployedContracts` type
- `src/patterns/multisig-updates.ts` — `configureMultiSigDelegation`, `fetchUpdateDigest`, `setAttributeWithMultiSig`
- `src/patterns/timelock-updates.ts` — `configureTimelockDelegation`, `proposeDidUpdate`, `executeDidUpdate`, `cancelDidUpdate`
- `src/patterns/revocation.ts` — `setupRevocationDelegation`, `addDIDAttribute`, `revokeAttribute`, `revokeCredential`, `checkIsRevoked`
- `src/patterns/cross-chain-sync.ts` — `signCrossChainAuthorization`, `signCrossChainUpdate`, `relayerSubmitUpdate`
- `test/multisig-updates.test.ts` — 3 tests: happy path, threshold enforcement, replay rejection
- `test/timelock-updates.test.ts` — 3 tests: happy path, delay enforcement, cancellation
- `test/revocation.test.ts` — 3 tests: ERC-1056 revocation, credential revocation, attacker rejection
- `test/cross-chain-sync.test.ts` — 3 tests: relayer-bundled delegation+update, replay rejection, wrong chain ID rejection

### Fixed
- Cross-chain pattern: use `executor: relayerAddress` (not `executor: 'self'`) when relayer sends the type-4 tx. `executor: 'self'` inflates EOA nonce by 1, causing auth to be silently ignored by Ethereum.

### Notes
- 20/20 tests passing across 9 test files
- All Part 2 contracts store state in EOA storage (not contract storage) via the 7702 delegation model
- Combining delegation + first real call in one tx avoids the Anvil gas estimation issue with no-op `data: '0x'` on nonce-0 EOAs



### Added
- `README.md` — setup instructions, pattern table, project structure

### Changed
- All pattern functions now check `receipt.status === 'reverted'` and throw explicitly (consistent across all 4 patterns)
- Fixed malformed JSDoc in `policy-enforced.ts`

## [0.8.0] — Phase 6 — Article

### Added
- `article/eip-7702-did-ethr.md` — technical article covering all four patterns, the authorization mechanism, security implications, and a summary table

## [0.7.0] — Phase 5 — Pattern 3: Policy-Enforced DID Updates

### Added
- `contracts/PolicyDIDManager7702.sol` — session-key delegation contract with:
  - `configure(sessionKey, maxValidity, allowedPrefix)` — owner-only setup
  - `setAttributeViaSessionKey(...)` — session key entrypoint with validity cap + prefix enforcement
- `src/utils/abis.ts` — added `POLICY_DID_MANAGER_ABI`
- `src/deploy.ts` — deploys `PolicyDIDManager7702`; updated `DeployedContracts` type
- `src/patterns/policy-enforced.ts` — `configurePolicyDelegation()` + `sessionKeyDidUpdate()`
- `test/policy-enforced.test.ts` — 3 tests: happy path, validity cap, prefix rejection

### Fixed
- `src/utils/anvil.ts` — corrected `ANVIL_PRIVATE_KEYS[8]` (was `...da1`, actual `...b97`)
- `sessionKeyDidUpdate` — check `receipt.status` to throw on contract reverts

### Notes
- `waitForTransactionReceipt` does NOT throw on revert; must check `status === 'reverted'` manually
- Each vitest `it()` is isolated by Anvil snapshot/revert — state never leaks between tests
- `gas: 200_000n` required on session-key tx to bypass `eth_estimateGas` failure on 7702-delegated EOAs

## [0.6.0] — Phase 4 — Pattern 2: Gasless/Sponsored DID Updates

### Added
- `src/patterns/gasless-updates.ts` — `gaslessDidUpdate()`: EOA signs 7702 auth with `executor: sponsorAddress`; sponsor broadcasts the type-4 tx and pays gas
- `test/gasless-updates.test.ts` — verifies EOA balance unchanged, DID document updated, delegation code set

### Notes
- `executor: 'self'` vs `executor: <address>` is the only API difference between Pattern 0 and Pattern 2
- EOA balance assertion proves the gas was paid by the sponsor, not the EOA

## [0.5.0] — Phase 3 — Pattern 1: Batched DID Updates

### Added
- `contracts/DIDManager7702.sol` — added `setBatchAttributesForIdentity(address registry, AttributeUpdate[] updates)` for atomic multi-attribute updates
- `src/utils/abis.ts` — added `setBatchAttributesForIdentity` entry to `DID_MANAGER_ABI`
- `src/patterns/batched-updates.ts` — `batchedDidUpdates()`: one EIP-7702 auth + one type-4 tx sets N DID attributes atomically
- `test/batched-updates.test.ts` — integration test asserting Ed25519 (#delegate-1) and Secp256k1 (#delegate-2) both appear in resolved DID document

### Notes
- `Secp256k1` key via `did/pub/Secp256k1/veriKey/base64` resolves as `EcdsaSecp256k1VerificationKey2019` (not `Secp256k1VerificationKey2018`)
- Artifacts auto-recompiled; `setBatchAttributesForIdentity` uses a struct array for clean calldata encoding

## [0.4.1] — Phase 2.5 — Tightened DID document assertions

### Fixed
- `test/simple-update.test.ts` — replaced weak proxy assertion (`verificationMethod.length > 1`) with
  precise checks on the specific fragment ID (`#delegate-1`), method type (`Ed25519VerificationKey2018`),
  key material (`publicKeyBase64 === 'YmFzZTY0ZW5jb2RlZHB1YmtleQ=='`), and DID document sections
  (`assertionMethod` contains the key, `authentication` does not)

### Lessons
- Proxy assertions (length checks) are not proof. Always verify the exact expected state.

## [0.4.0] — Phase 2.5 — Pattern 0: Simple 7702 DID Update

### Added
- `src/utils/abis.ts` — shared `DID_MANAGER_ABI` reused across patterns
- `src/patterns/simple-update.ts` — `simpleDidUpdate()`: signs EIP-7702 authorization (`executor: 'self'`),
  sends a single type-4 tx that sets the delegation and calls `setAttributeForIdentity` atomically
- `test/simple-update.test.ts` — Pattern 0 integration test

### Notes
- `executor: 'self'` tells viem the EOA is also the tx sender — handles auth nonce offset automatically
- `to: eoaAddress` — calling the EOA itself triggers the delegated code; `address(this)` == EOA
- Delegation indicator: `getCode(eoaAddress)` returns `0xef0100<20-byte-didManager-address>` after delegation

### Lessons
- viem `encodeFunctionData` requires `bytes` params as hex strings, not `Uint8Array` — use `toHex()`

## [0.3.0] — Phase 2 — Solidity Contracts + Compilation Pipeline

### Added
- `contracts/DIDManager7702.sol` — minimal EIP-7702 delegation contract with `setAttributeForIdentity`
- `scripts/compile.ts` — solc-js compilation pipeline; reads `contracts/*.sol`, outputs `artifacts/<Name>.json`
- Updated `src/deploy.ts` — `deployAll()` now deploys `DIDManager7702`; returns `{ registry, didManager }`
- Updated `test/globalSetup.ts` — auto-compiles if artifacts missing; writes `didManager` address to test env

### Notes
- `solc` npm package (v0.8.28) is CJS; use `createRequire(import.meta.url)` to import in ESM context
- Compilation uses `evmVersion: 'prague'` to match Anvil hardfork
- `artifacts/` is git-ignored; `globalSetup` auto-compiles on first `pnpm test` run

## [0.2.0] — Phase 1 — Infrastructure

### Added
- `src/utils/anvil.ts` — Anvil process lifecycle (start/stop/wait), hardcoded dev accounts/keys
- `src/utils/registry.ts` — `deployRegistry()` using viem `deployContract` + EthereumDIDRegistry artifact
- `src/deploy.ts` — `deployAll()` orchestration; returns `{ registry }`
- `test/globalSetup.ts` — vitest globalSetup: starts Anvil (Prague hardfork), deploys ERC-1056, writes `/tmp/ethr-7702-test-env.json`
- `test/setup.ts` — per-test snapshot/revert via viem test client
- `test/infrastructure.test.ts` — 2 passing tests: DID resolution + setAttribute round-trip

### Notes
- ethr-did-resolver v11.0.5; `EthereumDIDRegistry.abi` and `.bytecode` used for deployment
- DID network name `dev` with chainId 31337; DIDs look like `did:ethr:dev:0x<address>`

## [0.1.0] — Phase 0 — Project Scaffolding

### Added
- `package.json` with pnpm, vitest, viem, ethers, ethr-did, ethr-did-resolver, solc
- `tsconfig.json` targeting ES2022 with ESNext modules
- `vitest.config.ts` with globalSetup for Anvil lifecycle management
- `.gitignore`, `LESSONS.md`, `TODO.md`
- Directory structure: contracts/, src/patterns/, src/utils/, scripts/, test/, article/, artifacts/

### Notes
- pnpm for package management
- solc npm package (v0.8.28) for Solidity compilation — no Foundry needed for compilation
- Anvil (from Foundry) is the only non-npm prerequisite (local Pectra testnet)

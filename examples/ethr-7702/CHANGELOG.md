# Changelog

## [1.8.1] — Phase 16 — Resolve DID works as step 0

### Fixed
- `webapp/src/App.tsx` — the **Resolve DID** button now works *before* any contracts are deployed. Previously on Local Anvil it passed `undefined` as the registry, so the resolver fell back to the mainnet registry (no code on Anvil) and failed. Now the app tracks the registry address separately from the 7 managers: resolving on local mode deploys *only* the ERC-1056 registry on demand, and the full "Deploy contracts" flow reuses that registry instead of deploying a second one.

### Added
- Smoke test `webapp/src/patterns/smoke.test.ts` → "resolves the identity DID as step 0": deploys only the registry and asserts the baseline document (identity as `#controller`, no user attributes).

### Test suite
- 62/62 root tests passing; webapp smoke test 3/3 passing (incl. new step-0 resolve); typechecks clean (root + webapp); production build succeeds.

---

## [1.8.0] — Phase 16 — Namespaced storage: cross-manager slot collision fix

### Fixed
- All 6 stateful delegation contracts (`MultiSig`, `Policy`, `MetaTx`, `CrossChain`, `Expiring`, `Revocation`) now anchor their state at a unique ERC-7201-style namespace — `keccak256("ethr-7702.<ContractName>")` — via a storage-struct pointer set in assembly. Re-delegating a single EOA between different managers can no longer collide (previously Policy/MultiSig/MetaTx/CrossChain/Expiring all wrote EOA slots 0/1/2, so policy→multisig made `delete signers` read a stale `sessionKey` address as the array length → out-of-gas). Public getters preserved as explicit view functions.
- `webapp/src/patterns/registry.ts` — live nonce reads now compute the namespaced slot: `BigInt(keccak256(toBytes("ethr-7702.<Name>"))) + offset` (multisig nonce +2, meta-tx/cross-chain +0).

### Added
- Regression test `test/edge-cases.test.ts` → "re-delegating one EOA from Policy to MultiSig does not collide storage": configures an EOA under Policy, re-delegates the same EOA to MultiSig, and asserts the new 2-of-3 signer set + nonce are intact.

### Notes
- Changed bytecode → all 6 artifacts regenerated. Testnet pre-deploy (`scripts/deploy-testnet.ts`) must be re-run before relying on pre-deployed `webapp/src/config/deployed.json` addresses.
- Solidity gotcha: inline assembly cannot reference a `bytes32 constant` initialized from `keccak256` — compute the slot into a local `bytes32` var first.

### Test suite
- 62/62 tests passing (13 files incl. new collision regression); webapp smoke test 2/2 passing (all 22 pattern steps); typechecks clean (root + webapp); production build succeeds.

---

## [1.7.0] — Phase 15 — Interactive Webapp Explainer

### Added
- `webapp/` — static Vite + React interactive explainer for the EIP-7702 × did:ethr patterns:
  - `index.html`, `vite.config.ts` (base `./`, root `webapp/`, aliases `@patterns`/`@utils` → `src/patterns`/`src/utils`), `tsconfig.json`
  - `src/App.tsx` — network picker (Local Anvil / Sepolia / Gnosis), deploy card, per-step run buttons, DID document viewer, in-memory key panel
  - `src/config/chains.ts` — network config (RPC URLs, EIP-7702 registry addresses, faucets); `src/config/deployed.json` — placeholder for pre-deployed testnet addresses
  - `src/lib/keys.ts` — in-memory `KeyManager` (burner keys seeded with Anvil dev keys on local; MetaMask cannot sign 7702 auth tuples, so keys stay in-browser)
  - `src/lib/clients.ts`, `src/lib/deploy.ts` (sequential in-browser deploys to avoid nonce collisions), `src/lib/resolve.ts` (browser `ethr-did-resolver`)
  - `src/patterns/types.ts` + `src/patterns/registry.ts` — 12 patterns (0, 1, 2, 3, 4, 1a, 6, 7, 8, 9, 10, 11) wired to the shared `src/patterns/*` implementations; nonces read via `getStorageAt` (works before delegation exists)
  - `src/patterns/smoke.test.ts` + `webapp/vitest.config.ts` — headless smoke test: deploys via the app's own code path, then runs all 22 pattern steps + DID resolution against Anvil
- `scripts/deploy-testnet.ts` — one-time testnet pre-deploy of the 7 managers (registry already live); writes `webapp/src/config/deployed.json`
- `.github/workflows/pages.yml` — build + deploy `webapp/dist` to GitHub Pages on push to `main`
- `package.json` scripts: `dev:webapp`, `build:webapp`, `preview:webapp`, `test:webapp`, `typecheck:webapp`; devDeps vite 7.3.1, @vitejs/plugin-react 5.2.0, react 19.2.8
- `README.md` — webapp usage, testnet pre-deploy, full structure tree

### Fixed
- `src/patterns/*.ts` (7 files) + 2 test files — `signAuthorization`/`signTypedData` calls now pass `account: client.account!` explicitly (viem 2.47 made `account` required when the client's account generic is unresolved); repo now typechecks clean (root + webapp)
- `src/patterns/multisig-updates.ts` — explicit `gas: 300_000n` on the configure tx (avoids Anvil estimation quirk when re-delegating an EOA)
- `webapp/src/patterns/registry.ts` — live nonce reads via `getStorageAt` (multisig slot 0x2, meta-tx/cross-chain slot 0x0); JSON-safe BigInt serialization
- `webapp/src/lib/resolve.ts` — `resolveDid` accepts a runtime registry address (required for local mode where the registry is deployed in-browser)
- `vitest.config.ts` — excludes `webapp/**` from the root suite (smoke test runs via `test:webapp`)

### Test suite
- 61/61 tests passing (12 files); webapp smoke test 2/2 passing (all 22 pattern steps + DID resolution); webapp typecheck clean; production build succeeds

---

## [1.6.0] — Phase 14 — MetaTx Pattern, H-1 Security Fix, Article Update

### Added
- `contracts/MetaTxDIDManager7702.sol` — EIP-712 meta-transaction delegation contract (Pattern 1a):
  - `nonce` stored at slot 0 for replay protection
  - `setAttributeMetaTx(registry, name, value, validity, sig)` — verifies EOA EIP-712 signature, calls `setAttribute`
  - `setBatchAttributesMetaTx(registry, updates, sig)` — verifies batch digest, calls `setAttribute` for each update
  - `getNonce()`, `attributeDigest()`, `batchAttributeDigest()` view functions for off-chain signing
  - Domain: `name="MetaTxDIDManager7702"`, `version="1"`, chain+verifyingContract bound
- `src/utils/abis.ts` — `META_TX_DID_MANAGER_ABI` added
- `src/deploy.ts` — `MetaTxDIDManager7702` deployed in `deployAll()`; `metaTxDidManager` added to `DeployedContracts` type
- `src/patterns/meta-tx-updates.ts` — `metaTxDidUpdate()` and `metaTxBatchDidUpdate()` pattern helpers
- `test/meta-tx-updates.test.ts` — 6 integration tests:
  - Happy path single attribute via meta-tx
  - Happy path batch attributes via meta-tx
  - Nonce increments after each meta-tx (replay protection)
  - Replayed signature rejected
  - Wrong signer signature rejected
  - Batch with wrong signer rejected

### Fixed (Security — H-1)
- `contracts/MultiSigDIDManager7702.sol` — non-signer signatures now explicitly rejected:
  - Old: `if (_isSigner(recovered)) { verified++; }` silently skipped unknown signers
  - New: `require(_isSigner(recovered), "not a registered signer")` — reverts immediately if any signature is from a non-registered address
  - Prevents an attacker from padding the signature array with their own signatures to reach threshold

### Changed
- `test/edge-cases.test.ts`:
  - Removed `TimelockDIDManager7702` edge case block (contract removed in Phase 13 cleanup)
  - Removed `timelockDidManager` from `TestEnv` type
  - Added `metaTxDidManager` to `TestEnv.contracts`
  - Fixed header comment "six" → "five" (five delegation contracts remain)
  - Added H-1 regression test: non-signer signature in multisig now reverts with "not a registered signer"
- `article/eip-7702-did-ethr.md` — added security framing paragraph after Pattern 0:
  - Explains Pattern 0 has no access control by design
  - Notes EIP-7702 does not inherently improve security
  - Introduces `MetaTxDIDManager7702` as Pattern 1a with EIP-712 authorization

### Removed
- `contracts/TimelockDIDManager7702.sol` — removed (superseded; pattern consolidated)
- `src/patterns/timelock-updates.ts` — removed
- `test/timelock-updates.test.ts` — removed

### Test suite
- 61/61 tests passing (12 files)

---

## [1.5.0] — Phase 13 — MetaMask Delegation Framework Integration

### Added
- `contracts/DIDAttributeEnforcer.sol` — stateless caveat enforcer for the MetaMask Delegation Framework:
  - `beforeHook(terms, args, mode, executionCalldata, ...)` — validates `setAttribute` calls against a 4-byte name prefix
  - `terms` = `bytes4` allowed prefix (set at delegation time); reverts if calldata uses a different prefix or non-`setAttribute` selector
  - Storage-free: no state variables; all enforcement is pure
- `artifacts/DIDAttributeEnforcer.json` — compiled artifact
- `src/utils/metamask-framework.ts` — deploys the MetaMask Delegation Framework contracts to Anvil:
  - `deployMetaMaskFramework(walletClient, publicClient)` → `{ entryPoint, delegationManager, statelessDeleGator }`
  - Loads bytecodes from `@metamask/delegation-abis` via `createRequire` (pnpm store path)
  - Re-exports `DelegationManagerABI`, `EIP7702StatelessDeleGatorABI`, `EntryPointABI`
- `src/deploy.ts` — extended to deploy MetaMask framework + `DIDAttributeEnforcer`; `DeployedContracts` type now includes `entryPoint`, `delegationManager`, `statelessDeleGator`, `didAttributeEnforcer`
- `test/metamask-delegation.test.ts` — 5 integration tests:
  - **Framework deployed**: confirms all 3 framework contracts + enforcer have bytecode
  - **Happy path**: EOA → EIP-7702 deleGator → relayer calls `DelegationManager.redeemDelegations` → enforcer passes → `setAttribute` written → DID attribute confirmed via logs
  - **Enforcer blocks wrong prefix**: `svc/LinkedDomains` attr (prefix `0x7376632f`) rejected by enforcer configured for `did/` prefix (`0x6469642f`)
  - **Gas comparison**: custom `DIDManager7702` = ~67k gas vs MetaMask framework = ~116k gas (+48k overhead)
  - **Enforcer blocks non-setAttribute**: `revokeAttribute` calldata rejected due to wrong selector

### Discovered / documented
- `redeemDelegations` must be called on `DelegationManager` directly, NOT on the deleGator. The DelegationManager checks `msg.sender == delegation.delegate` (relayer) and then calls `deleGator.executeFromExecutor`. Calling the deleGator's `redeemDelegations` makes the DelegationManager see the deleGator (EOA) as redeemer, not the relayer.
- MetaMask `SIGNABLE_DELEGATION_TYPED_DATA` includes only `{ enforcer, terms }` in the `Caveat` type — `args` is intentionally excluded from EIP-712 signing even though it exists on the on-chain struct.
- `@metamask/delegation-abis` is not directly importable in the project; must use `createRequire` pointed at the pnpm store path inside `@metamask/smart-accounts-kit`.
- Both `did/pub/...` and `did/svc/...` attributes share the same 4-byte prefix `did/` (`0x6469642f`); use an entirely different namespace (e.g. `svc/...`) to test prefix rejection.

### Test suite
- 63/63 tests passing (12 files)

---

## [1.4.0] — Phase 12 — Delegation Lifecycle Patterns

### Added
- `contracts/ExpiringDIDManager7702.sol` — app-level TTL delegation contract:
  - `configure(expiry)` sets a Unix timestamp deadline (only callable by EOA owner)
  - `setAttributeForIdentity(...)` reverts after expiry or if not configured
  - `isActive()` view function returns current active status
- `src/utils/abis.ts` — `EXPIRING_DID_MANAGER_ABI` added
- `src/deploy.ts` — `ExpiringDIDManager7702` deployed in `deployAll()`, `expiringDidManager` added to `DeployedContracts` type
- `test/delegation-lifecycle.test.ts` — 11 lifecycle pattern tests:
  - **Pattern 8 (Delegation Revocation)**: revoking by re-authorizing to `address(0)` clears EOA code; subsequent calls are no-ops
  - **Pattern 9 (Re-delegation A→B)**: re-authorizing to a different contract swaps code pointer atomically; EOA code reflects new contract address
  - **Pattern 10 (Expiring Delegation)**: write succeeds before expiry, reverts after; `isActive()` correctly tracks state; reconfiguring renews delegation; unconfigured EOA rejects writes
  - **Pattern 11 (EXTCODESIZE pitfall)**: delegated EOA has 23-byte delegation designator (`0xef0100` + address); naive `isContract()` checks return `true` — documents the pitfall

### Discovered / documented
- Sending calldata to an EOA with no code (after revocation) **succeeds** (no revert) — the EVM ignores the data
- Bundling delegate+revoke in one tx with same nonce only applies the first auth tuple
- EIP-7702 delegation designator is exactly 23 bytes: `0xef0100` + 20-byte address

### Test suite
- 58/58 tests passing (11 files)

---

## [1.3.0] — Phase 11 — Security Bug Fixes + Edge Case Tests

### Fixed (Solidity)
- `MultiSigDIDManager7702.configure()`: duplicate signers are now rejected (signers must be in strictly ascending order)
- `MultiSigDIDManager7702.setAttributeWithMultiSig()`: reverts with "not configured" when called before `configure()` (threshold=0 bypass closed)
- `MultiSigDIDManager7702._recoverSigner()`: EIP-2 high-s malleability check added
- `CrossChainDIDManager7702._recoverSigner()`: EIP-2 high-s malleability check added

### Added
- `test/edge-cases.test.ts` — 27 edge case tests across all 6 delegation contracts:
  - `DIDManager7702`: empty batch no-op, third-party call allowed (by design)
  - `PolicyDIDManager7702`: non-session-key rejection, call before configure, boundary validity, reconfigure revokes old key
  - `MultiSigDIDManager7702`: threshold=0 bypass blocked, duplicate/unsorted signers rejected, zero address rejected, threshold > signers rejected, unordered sigs rejected, extra sigs accepted, reconfigure revokes old set
  - `TimelockDIDManager7702`: delay=0 immediate execution, duplicate proposal, nonexistent proposal, double execution, non-owner cancel, third-party execute
  - `RevocationDIDManager7702`: idempotent revocation, non-owner revokeAttribute rejected, non-owner setAttribute rejected
  - `CrossChainDIDManager7702`: invalid sig length, zero-byte sig, wrong signer, nonce increments

### Test suite
- 47/47 tests passing (10 files)

---

## [1.2.0] — Phase 10 — Formal Code Coverage

### Added
- `@vitest/coverage-v8` dev dependency (v3.2.4, matched to vitest version)
- `coverage` config block in `vitest.config.ts`: provider v8, text+html+lcov reporters, `src/**` included
- `"test:coverage"` script in `package.json`
- `coverage/` added to `.gitignore`

### Changed
- `package.json` version bumped to `1.1.0` (matches CHANGELOG)
- Removed unused `ethr-did` dependency from `package.json`

### Baseline Coverage
- 81.3% statements, 57.1% branches, 75.9% functions (20/20 tests passing)

---

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

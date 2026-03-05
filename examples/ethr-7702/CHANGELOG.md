# Changelog

## [0.4.0] — Phase 2.5 — Pattern 0: Simple 7702 DID Update

### Added
- `src/utils/abis.ts` — shared `DID_MANAGER_ABI` reused across patterns
- `src/patterns/simple-update.ts` — `simpleDidUpdate()`: signs EIP-7702 authorization, sends type-4 tx that delegates to `DIDManager7702` and calls `setAttributeForIdentity` in one transaction
- `test/simple-update.test.ts` — Pattern 0 integration test

### Test run
```
pnpm test
✓ test/simple-update.test.ts > Pattern 0: Simple 7702 DID Update > EOA can update its DID document via 7702 delegation to DIDManager7702
✓ test/infrastructure.test.ts > Infrastructure > resolves a default DID document for a local identity
✓ test/infrastructure.test.ts > Infrastructure > can call setAttribute and see it reflected in the DID document
Test Files  2 passed (2)  Tests  3 passed (3)
```

### Notes
- `executor: 'self'` in `signAuthorization` tells viem the EOA is also the tx sender — handles auth nonce offset automatically
- `authorizationList` in `sendTransaction` triggers viem to use transaction type 4 (EIP-7702)
- `to: eoaAddress` — calling the EOA itself triggers the delegated code in its context; `address(this)` == EOA
- Delegation indicator: `getCode(eoaAddress)` returns `0xef0100<20-byte-didManager-address>` after delegation

### Lessons
- viem `encodeFunctionData` requires `bytes` params as hex strings, not `Uint8Array` — use `toHex()` to convert

## [0.3.0] — Phase 2 — Solidity Contracts + Compilation Pipeline

### Added
- `contracts/DIDManager7702.sol` — minimal EIP-7702 delegation contract with `setAttributeForIdentity`
- `scripts/compile.ts` — solc-js compilation pipeline; reads `contracts/*.sol`, outputs `artifacts/<Name>.json`
- `src/utils/abis.ts` — shared ABI definitions
- Updated `src/deploy.ts` — `deployAll()` now deploys `DIDManager7702`; returns `{ registry, didManager }`
- Updated `test/globalSetup.ts` — auto-compiles contracts if artifacts missing; writes `didManager` address to test env

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

### Test run
```
pnpm test
✓ test/infrastructure.test.ts > Infrastructure > resolves a default DID document for a local identity
✓ test/infrastructure.test.ts > Infrastructure > can call setAttribute and see it reflected in the DID document
Test Files  1 passed (1)  Tests  2 passed (2)
```

### Notes
- ethr-did-resolver v11.0.5 used; `EthereumDIDRegistry.abi` and `.bytecode` used for deployment
- DID network name `dev` with chainId 31337 (Anvil default); DIDs look like `did:ethr:dev:0x<address>`
- `stringToBytes32` from `ethr-did-resolver` used directly in tests (no custom helper needed)

## [0.1.0] — Phase 0 — Project Scaffolding

### Added
- `package.json` with pnpm, vitest, viem, ethers, ethr-did, ethr-did-resolver, solc
- `tsconfig.json` targeting ES2022 with ESNext modules
- `vitest.config.ts` with globalSetup for Anvil lifecycle management
- `.gitignore`
- `LESSONS.md` for tracking assumptions and corrections
- `TODO.md` for task tracking
- Directory structure: contracts/, src/patterns/, src/utils/, scripts/, test/, article/, artifacts/

### Notes
- Uses pnpm for package management
- solc npm package (v0.8.28) handles Solidity compilation — no Foundry needed for compilation
- Anvil (from Foundry) is the only non-npm prerequisite (for local Pectra testnet)


### Added
- `src/utils/anvil.ts` — Anvil process lifecycle (start/stop/wait), hardcoded dev accounts/keys
- `src/utils/registry.ts` — `deployRegistry()` using viem `deployContract` + EthereumDIDRegistry artifact
- `src/deploy.ts` — `deployAll()` orchestration; returns `{ registry }` 
- `test/globalSetup.ts` — vitest globalSetup: starts Anvil (Prague hardfork), deploys ERC-1056, writes `/tmp/ethr-7702-test-env.json`
- `test/setup.ts` — per-test snapshot/revert via viem test client
- `test/infrastructure.test.ts` — 2 passing tests: DID resolution + setAttribute round-trip

### Test run
```
pnpm test
✓ test/infrastructure.test.ts > Infrastructure > resolves a default DID document for a local identity
✓ test/infrastructure.test.ts > Infrastructure > can call setAttribute and see it reflected in the DID document
Test Files  1 passed (1)  Tests  2 passed (2)
```

### Notes
- ethr-did-resolver v11.0.5 used; `EthereumDIDRegistry.abi` and `.bytecode` used for deployment
- DID network name `dev` with chainId 31337 (Anvil default); DIDs look like `did:ethr:dev:0x<address>`
- `stringToBytes32` from `ethr-did-resolver` used directly in tests (no custom helper needed)

## [0.1.0] — Phase 0 — Project Scaffolding

### Added
- `package.json` with pnpm, vitest, viem, ethers, ethr-did, ethr-did-resolver, solc
- `tsconfig.json` targeting ES2022 with ESNext modules
- `vitest.config.ts` with globalSetup for Anvil lifecycle management
- `.gitignore`
- `LESSONS.md` for tracking assumptions and corrections
- `TODO.md` for task tracking
- Directory structure: contracts/, src/patterns/, src/utils/, scripts/, test/, article/, artifacts/

### Notes
- Uses pnpm for package management
- solc npm package (v0.8.28) handles Solidity compilation — no Foundry needed for compilation
- Anvil (from Foundry) is the only non-npm prerequisite (for local Pectra testnet)

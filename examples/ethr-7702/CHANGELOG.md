# Changelog

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

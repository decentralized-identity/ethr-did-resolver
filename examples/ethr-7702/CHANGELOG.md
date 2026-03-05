# Changelog

## [Unreleased]

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

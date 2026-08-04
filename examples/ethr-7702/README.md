# EIP-7702 × did:ethr PoC

Proof-of-concept demonstrating how [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) (Pectra hardfork) enables new DID update patterns for [`did:ethr`](https://github.com/decentralized-identity/ethr-did-resolver) identities.

## Patterns

| # | Pattern | Description |
|---|---------|-------------|
| 0 | **Simple** | EOA signs 7702 auth + updates its own DID doc in one type-4 tx |
| 1 | **Batched** | One tx sets N DID attributes atomically |
| 2 | **Gasless** | EOA signs auth offline; sponsor pays gas and broadcasts |
| 3 | **Policy** | Session key updates DID doc within enforced prefix + validity constraints |

See [`article/eip-7702-did-ethr.md`](article/eip-7702-did-ethr.md) for the full technical writeup.

## Prerequisites

- [Node.js](https://nodejs.org) ≥ 18
- [pnpm](https://pnpm.io) — `npm i -g pnpm`
- [Foundry](https://getfoundry.sh) — for `anvil` (Pectra local testnet)

## Running

```bash
pnpm install
pnpm test
```

Tests start a local Anvil node (Prague hardfork), deploy ERC-1056 and both delegation contracts, then run 61 integration tests with per-test snapshot/revert isolation.

## Interactive webapp

`webapp/` is a static Vite + React explainer that runs every pattern in the browser against a **local Anvil** node (Pectra). It auto-deploys the registry + all delegation managers in-browser, and broadcasts true type-4 (EIP-7702) txs locally from a fixed Anvil dev key — no wallet, no testnet, no faucet.

```bash
pnpm anvil              # start local node (Prague/Osaka hardfork)
pnpm dev:webapp         # dev server
pnpm build:webapp       # production build → webapp/dist
pnpm preview:webapp     # serve the production build
pnpm typecheck:webapp   # typecheck webapp sources
pnpm test:webapp        # headless smoke test: run all pattern steps against Anvil
```

GitHub Actions deploys `webapp/dist` to GitHub Pages on every push to `main` (`.github/workflows/pages.yml`). The deployed page targets a local RPC, so it's a code/source explainer unless you run your own Anvil.

> Note: keys in the webapp live only in browser memory. The identity EOA (local KeyManager key) signs the authorization; the fixed Anvil broadcaster dev key signs + broadcasts the type-4 envelope locally. No injected wallet is involved — wallets strip the EIP-7702 `authorizationList`, so they can never be the type-4 broadcaster.

## Structure

```
contracts/
  DIDManager7702.sol          # Pattern 0/1/2 single-attr + batch setAttribute delegation
  PolicyDIDManager7702.sol    # Pattern 3 session-key policy enforcement
  MultiSigDIDManager7702.sol  # Pattern 4 M-of-N co-signed updates
  MetaTxDIDManager7702.sol    # Pattern 1a EIP-712 meta-transactions
  RevocationDIDManager7702.sol# Pattern 6 attribute + credential revocation
  CrossChainDIDManager7702.sol# Pattern 7 relayer-synced cross-chain updates
  ExpiringDIDManager7702.sol  # Pattern 10 time-to-live delegation

src/
  patterns/
    simple-update.ts          # Pattern 0
    batched-updates.ts        # Pattern 1
    gasless-updates.ts        # Pattern 2
    policy-enforced.ts        # Pattern 3
    multisig-updates.ts       # Pattern 4
    meta-tx-updates.ts        # Pattern 1a
    revocation.ts             # Pattern 6
    cross-chain-sync.ts       # Pattern 7
  utils/
    abis.ts                   # shared ABIs
    anvil.ts                  # Anvil process lifecycle + dev accounts
    registry.ts               # ERC-1056 deploy helper
  deploy.ts                   # deploy all contracts

webapp/
  vite.config.ts              # Vite config (root webapp/, aliases to src/)
  vitest.config.ts            # headless smoke test config
  src/
    App.tsx                   # main explainer UI
    patterns/registry.ts      # 12 patterns wired to src/patterns/*
    lib/                      # keys, clients, deploy, resolve
    config/                   # chains config

scripts/
  compile.ts                  # solc compile → artifacts/
  diagnose-did.ts             # one-shot real-chain DID diagnostic (read-only)

test/
  globalSetup.ts              # start Anvil, deploy, write /tmp env file
  setup.ts                    # per-test snapshot/revert
  infrastructure.test.ts      # ERC-1056 baseline
  simple-update.test.ts       # Pattern 0
  batched-updates.test.ts     # Pattern 1
  gasless-updates.test.ts     # Pattern 2
  policy-enforced.test.ts     # Pattern 3
  multisig-updates.test.ts    # Pattern 4
  meta-tx-updates.test.ts     # Pattern 1a
  revocation.test.ts          # Pattern 6
  cross-chain-sync.test.ts    # Pattern 7
  delegation-lifecycle.test.ts# Patterns 8-11
  metamask-delegation.test.ts # MetaMask delegation framework

article/
  eip-7702-did-ethr.md        # technical article
```

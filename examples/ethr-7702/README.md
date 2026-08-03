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

`webapp/` is a static Vite + React explainer that runs every pattern in the browser against a live network:

- **Local Anvil** — auto-deploys the registry + all 7 delegation managers in-browser
- **Sepolia / Gnosis** — uses the pre-deployed registry and (optionally) pre-deployed managers

```bash
pnpm dev:webapp          # dev server (needs anvil running for local mode)
pnpm build:webapp        # production build → webapp/dist
pnpm preview:webapp      # serve the production build
pnpm typecheck:webapp    # typecheck webapp sources
pnpm test:webapp         # headless smoke test: run all pattern steps against Anvil
```

GitHub Actions deploys `webapp/dist` to GitHub Pages on every push to `main` (`.github/workflows/pages.yml`).

### Pre-deploying managers to a testnet (one time)

The registry is already live on Sepolia/Gnosis, but the 7 delegation managers must be deployed once and their addresses committed so the static app can use them without a server:

```bash
DEPLOYER_KEY=0x... pnpm tsx scripts/deploy-testnet.ts sepolia
DEPLOYER_KEY=0x... pnpm tsx scripts/deploy-testnet.ts gnosis
```

This writes the addresses into `webapp/src/config/deployed.json`. Until then, testnet mode offers in-browser deployment via a funded burner key.

> Note: keys in the webapp live only in browser memory. MetaMask cannot sign EIP-7702 authorization tuples, so the explainer manages local burner accounts (seeded with Anvil dev keys on local mode).

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
    lib/                      # keys, clients, deploy, resolve, deployed
    config/                   # chains + pre-deployed addresses

scripts/
  compile.ts                  # solc compile → artifacts/
  deploy-testnet.ts           # one-time testnet pre-deploy

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

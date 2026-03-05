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

Tests start a local Anvil node (Prague hardfork), deploy ERC-1056 and both delegation contracts, then run 8 integration tests with per-test snapshot/revert isolation.

## Structure

```
contracts/
  DIDManager7702.sol          # single-attr + batch setAttribute delegation
  PolicyDIDManager7702.sol    # session-key policy enforcement

src/
  patterns/
    simple-update.ts          # Pattern 0
    batched-updates.ts        # Pattern 1
    gasless-updates.ts        # Pattern 2
    policy-enforced.ts        # Pattern 3
  utils/
    abis.ts                   # shared ABIs
    anvil.ts                  # Anvil process lifecycle + dev accounts
    registry.ts               # ERC-1056 deploy helper
  deploy.ts                   # deploy all contracts

test/
  globalSetup.ts              # start Anvil, deploy, write /tmp env file
  setup.ts                    # per-test snapshot/revert
  infrastructure.test.ts      # ERC-1056 baseline
  simple-update.test.ts       # Pattern 0
  batched-updates.test.ts     # Pattern 1
  gasless-updates.test.ts     # Pattern 2
  policy-enforced.test.ts     # Pattern 3

article/
  eip-7702-did-ethr.md        # technical article
```

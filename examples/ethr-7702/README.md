# EIP-7702 × did:ethr PoC

Proof-of-concept demonstrating how [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) (Pectra hardfork) enables new DID update patterns for [`did:ethr`](https://github.com/decentralized-identity/ethr-did-resolver) identities.

Includes an **interactive browser explainer** (Vite + React) that runs a few example patterns live against a local Anvil node.
The choice for using a local node (with programmatic funding and lower level signing) is a placeholder as wallets still don't have full support of EIP7702.
This will be updated as support grows, to an example that uses a browser extension wallet as the gas sponsor for transactions.

## First, a **DISCLAIMER**
This is a proof-of-concept, not a production-ready implementation. It is intended to demonstrate the new patterns enabled by EIP-7702, and to explore the implications for DID management.
None of the code is audited, and MUST not be used in production.

EIP7702 allows an Externally owned account (EOA) to delegate its authority to a contract. It is very easy to delegate to a poorer security model and lose control of both the DID and the underlying assets.
The patterns presented here are examples of how EIP-7702 can be used to improve management of a did:ethr identifier, as inspiration, NOT production-ready code.

## Patterns

All pattern numbers refer to the entries in the interactive webapp and the code below.

| # | Pattern | Contract | What it demonstrates |
|---|---------|----------|----------------------|
| 0 | **Simple** | `DIDManager7702` | EOA signs 7702 auth; a broadcaster relays one type-4 tx that sets the delegation and updates the DID doc |
| 1 | **Batched** | `DIDManager7702` | One tx sets N DID attributes atomically (e.g. Ed25519 + Secp256k1 veriKeys) |
| 2 | **Gasless** | `DIDManager7702` | EOA signs the auth offline; a sponsor broadcasts and pays all gas — the EOA never holds ETH |
| 3 | **Policy** | `PolicyDIDManager7702` | Session key updates the DID doc within an enforced name-prefix + validity cap |
| 4 | **Multi-sig** | `MultiSigDIDManager7702` | 2-of-3 co-signed updates over a canonical digest — no single key has unilateral control |
| 1a | **Meta-transactions** | `MetaTxDIDManager7702` | EIP-712 typed-data intent signed off-chain; a broadcaster submits it, replay-safe via a per-EOA nonce |
| 6 | **Revocation** | `RevocationDIDManager7702` | Dual revocation: ERC-1056 attribute expiry (`validTo = 0`) + app-level per-credential flags in EOA storage |
| 7 | **Cross-chain sync** | `CrossChainDIDManager7702` | EOA signs auth + EIP-712 update off-chain; a relayer submits both atomically on the target chain, EOA pays zero gas |
| 8 | **Delegation revocation** | EIP-7702 auth | Re-authorizing to `address(0)` clears the delegation code; calls become no-ops |
| 9 | **Re-delegation** | `DIDManager7702` → `ExpiringDIDManager7702` | A new authorization atomically swaps the code pointer (A → B) |
| 10 | **Expiring delegation** | `ExpiringDIDManager7702` | App-level time-to-live: writes succeed before expiry, revert after — no protocol change |

You'll find more detailed technical descriptions in [`article/`](article/):
- [`article/eip-7702-did-ethr.md`](article/eip-7702-did-ethr.md) — part 1: simple, batched, gasless, policy session keys (patterns 0–3)
- [`article/eip-7702-did-ethr-part2.md`](article/eip-7702-did-ethr-part2.md) — part 2: multi-sig, revocation, cross-chain sync, production hardening (patterns 4–7)

## Prerequisites

- [Node.js](https://nodejs.org) ≥ 18
- [pnpm](https://pnpm.io) — `npm i -g pnpm`
- [Foundry](https://getfoundry.sh) — for `anvil` (Pectra local testnet)

## Running the tests

```bash
pnpm install
pnpm test          # 64 headless integration tests on a local Anvil (Prague hardfork)
```

Tests start their own Anvil node on port 8545 (spawned + torn down by the test harness), deploy the ERC-1056 registry and the delegation contracts, and run with per-test snapshot/revert isolation.

## Interactive webapp

`webapp/` is a static Vite + React explainer that runs every pattern in the browser against a **local Anvil** node (Pectra). It auto-deploys the registry + each required delegation manager in-browser, and broadcasts true type-4 (EIP-7702) txs locally from a fixed Anvil dev key.

```bash
pnpm anvil              # start local node (Prague hardfork) — port 8545
pnpm dev:webapp         # dev server
```

> **Why a fixed broadcaster key?** The identity EOA (a local KeyManager key) signs the EIP-7702 authorization; a **fixed Anvil dev key** signs and broadcasts the type-4 envelope locally via viem.
>
> KeyManager keys persist to **localStorage** (survive reloads) and never pay gas; the broadcaster dev key pays all gas.

## Structure

```
contracts/
  DIDManager7702.sol          # patterns 0/1/2: single + batch setAttribute delegation (stateless)
  PolicyDIDManager7702.sol    # pattern 3: session-key policy enforcement (namespaced storage)
  MultiSigDIDManager7702.sol  # pattern 4: M-of-N co-signed updates (namespaced storage)
  MetaTxDIDManager7702.sol    # pattern 1a: EIP-712 meta-transactions (namespaced storage)
  RevocationDIDManager7702.sol# pattern 6: attribute + credential revocation (namespaced storage)
  CrossChainDIDManager7702.sol# pattern 7: relayer-synced cross-chain updates (namespaced storage)
  ExpiringDIDManager7702.sol  # pattern 10: time-to-live delegation (namespaced storage)
  DIDAttributeEnforcer.sol    # MetaMask Delegation Framework caveat enforcer (used by metamask tests)

src/
  deploy.ts                   # deploy all contracts to a running Anvil
  patterns/
    simple-update.ts          # pattern 0
    batched-updates.ts        # pattern 1
    gasless-updates.ts        # pattern 2
    policy-enforced.ts        # pattern 3
    multisig-updates.ts       # pattern 4
    meta-tx-updates.ts        # pattern 1a
    revocation.ts             # pattern 6
    cross-chain-sync.ts       # pattern 7
    delegation.ts             # patterns 8/9: set + revoke / re-delegate
    expiring.ts               # pattern 10: TTL delegation
  utils/
    abis.ts                   # shared ABIs
    anvil.ts                  # Anvil process lifecycle + dev accounts
    registry.ts               # ERC-1056 deploy helper
    eip712.ts                 # shared EIP-712 domain/digest helpers
    metamask-framework.ts     # MetaMask Delegation Framework helpers
    storage.ts                # namespaced-storage slot math

webapp/
  vite.config.ts              # Vite config (root webapp/, aliases to src/)
  vitest.config.ts            # headless smoke test config
  src/
    App.tsx                   # main explainer UI
    patterns/registry.ts      # 12 patterns wired to src/patterns/*
    lib/                      # keys (KeyManager), clients, deploy, resolve, create2, rpcLag
    config/chains.ts          # local-only network config

scripts/
  compile.ts                  # solc compile → artifacts/
  diagnose-did.ts             # one-shot DID diagnostic (read-only, sepolia/gnosis or custom RPC)
  probe-did.ts                # local-Anvil DID probe (uses test env file)

test/
  globalSetup.ts              # start Anvil, deploy, write /tmp env file
  setup.ts                    # per-test snapshot/revert
  infrastructure.test.ts      # ERC-1056 registry baseline
  simple-update.test.ts       # pattern 0
  batched-updates.test.ts     # pattern 1
  gasless-updates.test.ts     # pattern 2
  policy-enforced.test.ts     # pattern 3
  multisig-updates.test.ts    # pattern 4
  meta-tx-updates.test.ts     # pattern 1a
  revocation.test.ts          # pattern 6
  cross-chain-sync.test.ts    # pattern 7
  delegation-lifecycle.test.ts# patterns 8–11
  expiring-updates.test.ts    # pattern 10
  edge-cases.test.ts          # edge cases (delegation, nonce handling)
  metamask-delegation.test.ts # MetaMask Delegation Framework integration

article/
  eip-7702-did-ethr.md        # technical article part 1 (patterns 0–3)
  eip-7702-did-ethr-part2.md  # technical article part 2 (patterns 4–7, hardening)
```

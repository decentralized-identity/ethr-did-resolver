# Deploying the EthereumDIDRegistry

The registry package ships a plain deploy script (`scripts/deploy.ts`). Anyone can deploy the contract to a new network
with credentials from the environment only.

## Requirements

- Node.js and pnpm (the monorepo toolchain)
- An RPC endpoint for the target network
- A funded account to pay for the deployment

## One-time setup

```sh
cd packages/ethr-did-registry
cp .env.example .env
```

Fill in `.env` (it is gitignored — key material never enters the repository):

| Variable             | Required | Meaning                                                      |
|----------------------|----------|--------------------------------------------------------------|
| `DEPLOY_RPC_URL`     | yes      | JSON-RPC endpoint of the network to deploy to.               |
| `DEPLOY_PRIVATE_KEY` | no*      | Deploying account's private key (hex, `0x` prefix optional). |
| `DEPLOY_CHAIN_ID`    | no       | Override the chain ID reported by the RPC endpoint.          |

\* When `DEPLOY_PRIVATE_KEY` is omitted, the RPC node's own accounts are used (via `eth_accounts`) — fine for a local
`hardhat node`, not for public RPCs.

## Deploying

```sh
pnpm build        # ensure artifacts are fresh (also run implicitly by `hardhat run`)
pnpm run deploy:registry   # == hardhat run scripts/deploy.ts --network deploy
```

The `deploy` network is registered in `hardhat.config.ts` only when
`DEPLOY_RPC_URL` is set. Running the script with `--network hardhat` is refused:
that network is the in-memory simulated chain and the deployment would vanish.

> Note: the script is named `deploy:registry` because `pnpm deploy` is a
> built-in pnpm command; `pnpm run deploy:registry` always works.

### Local demo

```sh
cd packages/ethr-did-registry
npx hardhat node &                      # serves the local chain on http://127.0.0.1:8545
DEPLOY_RPC_URL=http://127.0.0.1:8545 \
pnpm run deploy:registry                # account 0 of the local node
```

## The verification record

The script prints a **source-verification record** — the audit trail of the deployment:

- `contract` — the deployed contract address
- `tx hash` — the deployment transaction hash
- `chainId` — the network's chain ID (queried from the RPC endpoint)
- `solc` — the exact compiler version used (`0.8.36+commit.…`), read from the Hardhat build-info, not from config
- `optimizer` — enabled/disabled and runs
- `viaIR`, `evmVersion` — only when set
- `source hash` — `keccak256` of the contract source file bytes
- `license` — the SPDX identifier from the contract source
- `bytecode` — integrity check that on-chain code matches the artifact

Every value comes from the compiled artifacts (build-info + artifact) plus the on-chain state, so the record is exactly
what a block explorer needs to source-verify the deployment.

## Hand-off: recording the deployment in the resolver

**The registry package does not own or publish deployments.** The canonical deployments list lives in the resolver
package (`packages/ethr-did-resolver/src/config/deployments.ts`), which this package never writes.

After a successful deployment:

1. Open a PR against `packages/ethr-did-resolver/src/config/deployments.ts`
   adding the new network, e.g.:

   ```ts
   { chainId: 11155111, registry: '0x…', name: '…', legacyNonce: false },
   ```

2. Paste the JSON verification record printed by the script into the PR description as the audit trail.

The deploy script only prints the hand-off instructions — the PR is the reviewable step that records the deployment.

## Out of scope

Deterministic (CREATE2) deployment is **not implemented**. Each deployment produces a fresh, non-deterministic address.

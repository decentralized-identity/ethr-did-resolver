# Ethereum DID Registry

This package contains the Ethereum contract code that allows the owner of an
ethr-did identity to update the attributes that appear in its DID document. It
exposes an API that allows developers to call the contract functions using
JavaScript, and it ships the compiled artifacts and typed bindings to deploy
the contract to another Ethereum network or interact with a deployed instance.

A DID is an [Identifier](https://w3c.github.io/did-core/#a-simple-example) that
allows you to look up a [DID document](https://w3c.github.io/did-core/#example-a-simple-did-document)
that can be used to authenticate you and messages created by you.

It is designed for resolving public keys for off-chain authentication — where
the public key resolution is handled by using decentralized technology.

This contract allows Ethereum addresses to present signing information about
themselves with no prior registration. It allows them to perform key rotation
and to specify different keys and services that are used on their behalf for
both on-chain and off-chain usage. It is the contract anchoring `did:ethr`
DIDs (see the [did method spec](../../doc/did-method-spec.md)).

## Contract Deployments

The canonical list of known registry deployments — one record per network
(chain ID, registry address, network name) — is maintained in the resolver
package, not here:

- `packages/ethr-did-resolver/src/config/deployments.ts`

Deployments are intentionally resolver-owned (see
`docs/adr/0001-registry-package-modern-scaffolding.md` in the monorepo root):
this package refers to the list but never writes or publishes it. New
deployments are added there via a reviewable PR; the deploy flow below prints
everything needed to record one.

## Using the Registry

The DID Registry can be used from JavaScript as well as directly from other
contracts.

### Imports

The package is ESM (`"type": "module"`) and exposes three entry points, all
verified to work:

**1. Root import — the compiled artifact (value)**

```ts
import { EthereumDIDRegistry } from 'ethr-did-registry'
```

This is the legacy-compatible root export: a plain JavaScript object with the
Hardhat artifact shape (`abi`, `bytecode`, `deployedBytecode`, …). Pass
`EthereumDIDRegistry.abi` to `new ethers.Contract(address, ...)`.

**2. Typed import — the generated contract types (types)**

```ts
import type { EthereumDIDRegistry } from 'ethr-did-registry'
```

The generated TypeChain interface (ethers v6 target), usable in type
annotations. It deliberately shares its name with the artifact export — the
artifact occupies the value slot, the generated interface occupies the type
slot, so `import` gives the artifact and `import type` gives the typed
contract:

```ts
import { EthereumDIDRegistry, EthereumDIDRegistry__factory } from 'ethr-did-registry'
import type { EthereumDIDRegistry as TypedRegistry } from 'ethr-did-registry'

const registry: TypedRegistry = EthereumDIDRegistry__factory.connect(address, signer)
```

`EthereumDIDRegistry__factory` is the generated typed factory for deploying or
connecting a typed contract instance.

**3. Deep artifact import — the raw JSON artifact**

```ts
import artifact from 'ethr-did-registry/artifacts/contracts/EthereumDIDRegistry.sol/EthereumDIDRegistry.json' with { type: 'json' }
```

The unmodified Hardhat artifact JSON, useful when you need the raw file (e.g.
for tooling that consumes artifacts directly). The ABI it contains is identical
to the root import's; only the module instance differs.

The generated typechain surface is also reachable as a deep import
(`ethr-did-registry/typechain-types`) when you want the raw generated exports
(contract type, factory, typed event namespaces) without the root entry's
value/type disambiguation.

### Example

Use [`ethers.js`](https://github.com/ethers-io/ethers.js/) (v6) with the
artifact from the root import:

```ts
import { ethers } from 'ethers'
import { EthereumDIDRegistry } from 'ethr-did-registry'

const DidReg = new ethers.Contract(registryAddress, EthereumDIDRegistry.abi)
DidReg.connect(yourSignerOrProvider)
```

## On-chain vs. Off-chain

For on-chain interactions, Ethereum has a built-in account abstraction that can
be used regardless of whether the account is a smart contract or a key pair.
Any transaction has a `msg.sender` as the verified sender of the transaction.

Since each Ethereum transaction must be funded, there is a growing trend of
on-chain transactions that are authenticated via an externally created
signature and not by the actual transaction originator. This allows for
third-party funding services, or for receivers to pay without any fundamental
changes to the underlying Ethereum architecture.

These kinds of transactions have to be signed by an actual key pair and thus
cannot be used to represent smart-contract-based Ethereum accounts.

We propose a way of a smart contract or regular key pair delegating signing for
various purposes to externally managed key pairs. This allows a smart contract
to be represented, both on-chain as well as off-chain or in payment channels,
through temporary or permanent delegates.

## Identity Identifier

Any Ethereum account, regardless of whether it is key-pair- or smart-contract-
based, is considered to be an account identifier.

An identity needs no registration.

## Identity Ownership

Each identity has a single address which maintains ultimate control over it. By
default, each identity is controlled by itself. As ongoing technological and
security improvements occur, an owner can replace themselves with any other
Ethereum address, such as an advanced multi-signature contract.

There is only ever a single identity owner. More advanced ownership models are
managed through a multi-signature contract.

### Looking up Identity Ownership

Ownership of an identity is verified by calling the
`identityOwner(address identity) public view returns (address)` function. This
returns the address of the current identity owner.

### Changing Identity Ownership

The account owner can replace themselves at any time by calling the
`changeOwner(address identity, address newOwner)` function.

There is also a version of this function which is called with an externally
created signature, passed to a transaction funding service.

The externally signed version has the following
signature: `changeOwnerSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, address newOwner)`.

The signature should be of the keccak256 hash of the following tightly packed
parameters:

`byte(0x19), byte(0), address of registry, nonce[currentOwner], identity, "changeOwner", newOwner`

## Delegates

Delegates are addresses that are delegated for a specific time to perform a
function on behalf of an identity.

They can be accessed both on-chain and off-chain.

### Delegate Types

The type of function is simply a string, determined by a protocol or
application higher up.

Examples:

- `'DID-JWT'`
- `'Raiden'`

### Validity

Delegates expire. The expiration time is application-specific and dependent on
the security requirements of the identity owner.

Validity is set using the number of seconds from the time that the delegate is
added.

### Looking up a Delegate

You can check whether an address is a delegate for an identity using the
`validDelegate(address identity, bytes32 delegateType, address delegate) returns (bool)`
function. This returns `true` if the address is a valid delegate of the given
`delegateType`.

### Adding a Delegate

An identity can assign multiple delegates to manage signing on its behalf for
specific purposes.

The account owner can call the
`addDelegate(address identity, bytes32 delegateType, address delegate, uint validity)`
function.

There is also a version of this function which is called with an externally
created signature, passed to a transaction funding service.

The externally signed version has the following
signature: `addDelegateSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, bytes32 delegateType, address delegate, uint validity)`.

The signature should be of the keccak256 hash of the following tightly packed
parameters:

`byte(0x19), byte(0), address of registry, nonce[currentOwner], identity, "addDelegate", delegateType, delegate, validity`

### Revoking a Delegate

A delegate may be manually revoked by calling the
`revokeDelegate(address identity, bytes32 delegateType, address delegate)`
function.

There is also a version of this function which is called with an externally
created signature, passed to a transaction funding service.

The externally signed version has the following
signature: `revokeDelegateSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, bytes32 delegateType, address delegate)`.

The signature should be of the keccak256 hash of the following tightly packed
parameters:

`byte(0x19), byte(0), address of registry, nonce[currentOwner], identity, "revokeDelegate", delegateType, delegate`

### Enumerating Delegates Off-chain

Attributes are stored as `DIDDelegateChanged` events. A `validTo` of 0
indicates a revoked delegate.

```solidity
event DIDDelegateChanged(
    address indexed identity,
    bytes32 delegateType,
    address delegate,
    uint validTo,
    uint previousChange
);
```

## Adding Off-chain Attributes

An identity may need to publish information that is only needed off-chain but
still requires the security benefits of using a blockchain.

### Setting Attributes

These attributes are set using the
`setAttribute(address identity, bytes32 name, bytes value, uint validity)`
function and published using events.

There is also a version of this function that is called with an externally
created signature, passed to a transaction funding service.

The externally signed version has the following
signature: `setAttributeSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, bytes32 name, bytes value, uint validity)`.

The signature should be of the keccak256 hash of the following tightly packed
parameters:

`byte(0x19), byte(0), address of registry, nonce[currentOwner], identity, "setAttribute", name, value, validity`

### Revoking Attributes

These attributes are revoked using the
`revokeAttribute(address identity, bytes32 name, bytes value)` function and
published using events.

There is also a version of this function that is called with an externally
created signature, passed to a transaction funding service.

The externally signed version has the following
signature: `revokeAttributeSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, bytes32 name, bytes value)`.

The signature should be of the keccak256 hash of the following tightly packed
parameters:

`byte(0x19), byte(0), address of registry, nonce[currentOwner], identity, "revokeAttribute", name, value`

### Reading Attributes

Attributes are stored as `DIDAttributeChanged` events. A `validTo` of 0
indicates a revoked attribute.

```solidity
event DIDAttributeChanged(
    address indexed identity,
    bytes32 name,
    bytes value,
    uint validTo,
    uint previousChange
);
```

### Delegate Types and Attribute Names Encoding

For gas cost reasons, the names of attributes and types of delegates are fixed
size `bytes32` values. In most situations, this is not a problem since most can
be represented by strings shorter than 32 bytes. To get a `bytes32` value from
them, the recommended approach is to use the byte array representation of your
string and right-pad it to 32 bytes.

## Enumerating Linked Identity Events

Contract events are a useful feature for storing data from smart contracts
exclusively for off-chain use. Unfortunately, current Ethereum implementations
provide a very inefficient lookup mechanism.

By using linked events that always link to the previous block with a change to
the identity, we can solve this problem with improved performance.

Each identity has its previously changed block stored in the `changed` mapping.

1. Look up the `previousChange` block for the identity
2. Look up all events for a given identity address, but only for the `previousChange` block
3. Do something with the event
4. Find `previousChange` from the event and repeat

Example code (ethers v6):

```js
const history = []
let prevChange = await DidReg.changed(identityAddress)
while (prevChange) {
  const logs = await ethers.provider.getLogs({
    topics: [null, `0x000000000000000000000000${identityAddress}`],
    fromBlock: prevChange,
    toBlock: prevChange,
  })
  prevChange = 0n
  for (const log of logs) {
    const logDescription = DidReg.interface.parseLog(log)
    history.unshift(logDescription)
    prevChange = logDescription.args.previousChange
  }
}
```

## Assemble a DID Document

The full spec describing how to interact with this registry to build a DID
document can be found in the
[did method spec](../../doc/did-method-spec.md).

In short, you would do something like this:

The primary owner key should be looked up using `identityOwner(identity)`. This
should be the first of the public keys listed.

Iterate through the `DIDDelegateChanged` events to build a list of additional
keys and authentication sections as needed. The list of delegate types to
include is still to be determined.

Iterate through `DIDAttributeChanged` events for service entries, encrypted
public keys, and other public names. The attribute names are still to be
determined.

## Deploying the Contract

The package ships a plain deploy script that deploys the compiled artifact to
any network and prints a complete **source-verification record** — the audit
trail of the deployment. See `docs/deploy.md` in this package for the full
runbook; the essentials:

### Requirements

- Node.js and pnpm (the monorepo toolchain)
- An RPC endpoint for the target network
- A funded account to pay for the deployment

### One-time setup

```sh
cd packages/ethr-did-registry
cp .env.example .env
```

Fill in `.env` (gitignored — key material never enters the repository):

| Variable             | Required | Meaning                                                      |
|----------------------|----------|--------------------------------------------------------------|
| `DEPLOY_RPC_URL`     | yes      | JSON-RPC endpoint of the network to deploy to.               |
| `DEPLOY_PRIVATE_KEY` | no*      | Deploying account's private key (hex, `0x` prefix optional). |
| `DEPLOY_CHAIN_ID`    | no       | Override the chain ID reported by the RPC endpoint.          |

\* When `DEPLOY_PRIVATE_KEY` is omitted, the RPC node's own accounts are used
(via `eth_accounts`) — fine for a local `hardhat node`, not for public RPCs.

### Deploying

```sh
pnpm run deploy:registry   # == hardhat run scripts/deploy.ts --network deploy
```

The `deploy` network is registered in `hardhat.config.ts` only when
`DEPLOY_RPC_URL` is set. Running the script against the in-memory `hardhat`
network is refused: the deployment would vanish.

> Note: the script is named `deploy:registry` because `pnpm deploy` is a
> built-in pnpm command; `pnpm run deploy:registry` always works.

### The verification record

The script prints a source-verification record — everything a block explorer
needs to source-verify the deployment, doubling as the audit trail that it
happened:

- `contract` — the deployed contract address
- `tx hash` — the deployment transaction hash
- `chainId` — the network's chain ID (queried from the RPC endpoint)
- `solc` — the exact compiler version used, read from the Hardhat build-info
- `optimizer` — enabled/disabled and runs
- `viaIR`, `evmVersion` — only when set
- `source hash` — `keccak256` of the contract source file bytes
- `license` — the SPDX identifier from the contract source
- `bytecode` — integrity check that on-chain code matches the artifact

### Hand-off: recording the deployment

**This package does not own or publish deployments.** The canonical deployments
list lives in the resolver package
(`packages/ethr-did-resolver/src/config/deployments.ts`), which this package
never writes. After a successful deployment:

1. Open a PR against `packages/ethr-did-resolver/src/config/deployments.ts`
   adding the new network, e.g.:

   ```ts
   { chainId: 11155111, registry: '0x…', name: '…', legacyNonce: false },
   ```

2. Paste the JSON verification record printed by the script into the PR
   description as the audit trail.

The deploy script prints these hand-off instructions — the PR is the reviewable
step that records the deployment.

## Development

The package is a member of the pnpm workspace at the monorepo root. From this
package directory (or from the root with `--filter ethr-did-registry`):

| Command               | What it does                                                        |
|-----------------------|---------------------------------------------------------------------|
| `pnpm install`        | Install dependencies (run once from the monorepo root).             |
| `pnpm build`          | Compile contracts (`hardhat compile`) and the TS entry (`tsc`).     |
| `pnpm test`           | Compile contracts and run the vitest suite against a local EDR network. |
| `pnpm run test:ci`    | Same as `pnpm test`, with coverage (`--coverage`).                  |
| `pnpm lint`           | `solhint` on contracts, `eslint` on TS sources and scripts.         |
| `pnpm format`         | `prettier` (with the solidity plugin) on contracts and TS sources.  |
| `pnpm clean`          | Remove generated artifacts, caches, typechain types and dist output.|

## License

MIT — see `LICENSE` in this package.

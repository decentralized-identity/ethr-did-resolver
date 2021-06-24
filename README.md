[![npm](https://img.shields.io/npm/dt/ethr-did-resolver.svg)](https://www.npmjs.com/package/ethr-did-resolver)
[![npm](https://img.shields.io/npm/v/ethr-did-resolver.svg)](https://www.npmjs.com/package/ethr-did-resolver)
[![codecov](https://codecov.io/gh/decentralized-identity/ethr-did-resolver/branch/develop/graph/badge.svg)](https://codecov.io/gh/decentralized-identity/ethr-did-resolver)

# ethr DID Resolver

This library is intended to use ethereum addresses or secp256k1 publicKeys as fully self-managed
[Decentralized Identifiers](https://w3c.github.io/did-core/#identifier) and wrap them in a
[DID Document](https://w3c.github.io/did-core/#did-document-properties)

It supports the proposed [Decentralized Identifiers](https://w3c.github.io/did-core/#identifier) spec from the
[W3C Credentials Community Group](https://w3c-ccg.github.io).

It requires the `did-resolver` library, which is the primary interface for resolving DIDs.

This DID method relies on the [ethr-did-registry](https://github.com/uport-project/ethr-did-registry).

## DID method

To encode a DID for an Ethereum address on the ethereum mainnet, simply prepend `did:ethr:`

eg:

`did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74`

Multi-network DIDs are also supported, if the proper configuration is provided during setup.

For example:
`did:ethr:0x4:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74` gets resolved on the rinkeby testnet (chainID=0x4), and
represents a distinct identifier than the generic one, with different DID documents and different key rotation history.

## DID Document

The did resolver takes the ethereum address, looks at contract events and builds a DID document based on the ERC1056
Events corresponding to the address. When an identifier is a full `publicKey`, the corresponding `ethereumAddress` is
computed and checked in the same manner.

The minimal DID document for an ethereum address `0xb9c5714089478a327f09197987f16f9e5d936e8a` with no transactions to
the registry looks like this:

```json
{
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://identity.foundation/EcdsaSecp256k1RecoverySignature2020/lds-ecdsa-secp256k1-recovery2020-0.0.jsonld"
  ],
  "id": "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a",
  "verificationMethod": [
    {
      "id": "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a#controller",
      "type": "EcdsaSecp256k1RecoveryMethod2020",
      "controller": "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a",
      "blockchainAccountId": "0xb9c5714089478a327f09197987f16f9e5d936e8a"
    }
  ],
  "authentication": [
    "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a#controller"
  ],
  "assertionMethod": [
    "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a#controller"
  ]
}
```

Note this resolver uses the `EcdsaSecp256k1RecoveryMethod2020` type and an `blockchainAccountId` to represent the
default
`verificationMethod`, `assertionMethod`, and `authentication` entry. Any value from the registry that returns an
ethereum address will be added to the `verificationMethod` array of the DID document with
type `EcdsaSecp256k1RecoveryMethod2020` and an `blockchainAccountId` attribute containing the address.

## Building a DID document

The DID document is not stored as a file, but is built by using read only functions and contract events on
the [ethr-did-registry](https://github.com/uport-project/ethr-did-registry) Ethereum smart contract.

Please see the [spec](doc/did-method-spec.md) for details of how the DID document and corresponding metadata are
computed.

## Resolving a DID document

The library presents a `resolve()` function that returns a `Promise` returning the DID document. It is not meant to be
used directly but through the [`did-resolver`](https://github.com/decentralized-identity/did-resolver) aggregator.

You can use the `getResolver(config)` method to produce an entry that can be used with the `Resolver`
constructor:

```javascript
import { Resolver } from 'did-resolver'
import { getResolver } from 'ethr-did-resolver'

// While experimenting, you can set a rpc endpoint to be used by the web3 provider
// You can also set the address for your own ethr-did-registry contract
const providerConfig = { rpcUrl: 'http://localhost:7545', registry: registry.address }
// It's recommended to use the multi-network configuration when using this in production
// since that allows you to resolve on multiple public and private networks at the same time.

// getResolver will return an object with a key/value pair of { "ethr": resolver } where resolver is a function used by the generic did resolver.
const ethrDidResolver = getResolver(providerConfig)
const didResolver = new Resolver(ethrDidResolver)

didResolver.resolve('did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74').then((doc) => console.log)

// You can also use ES7 async/await syntax
const doc = await didResolver.resolve('did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74')
```

## Multi-network configuration

In production, you will most likely want the ability to resolve DIDs that are based in different ethereum networks. To
do this, you need a configuration that sets the network name or chain ID (and even the registry address) for each
network. An example configuration for multi-network DID resolving would look like this:

```javascript
const providerConfig = {
  networks: [
    { name: "mainnet", provider: web3.currentProvider },
    { name: "0x4", rpcUrl: "https://rinkeby.infura.io/v3/<YOUR PROJECT ID>" }
    { name: "rsk:testnet", chainId: "0x1f", rpcUrl: "https://did.testnet.rsk.co:4444" }
    { name: "development", rpcUrl: "http://localhost:7545", registry: "0xdca7ef03e98e0dc2b855be647c39abe984fcf21b" }
    { name: "myprivatenet", chainId: 123456, rpcUrl: "https://my.private.net.json.rpc.url" }
  ]
}

const ethrDidResolver = getResolver(providerConfig)
```

The configuration from above allows you to resolve ethr-did's of the following formats:

- `did:ethr:mainnet:0xabcabc03e98e0dc2b855be647c39abe984193675`
- `did:ethr:0xabcabc03e98e0dc2b855be647c39abe984193675` (defaults to mainnet configuration)
- `did:ethr:0x4:0xabcabc03e98e0dc2b855be647c39abe984193675` (refer to the rinkeby network by chainID)
- `did:ethr:rsk:testnet:0xabcabc03e98e0dc2b855be647c39abe984193675`
- `did:ethr:0x1f:0xabcabc03e98e0dc2b855be647c39abe984193675` (refer to the rsk:testnet by chainID)
- `did:ethr:development:0xabcabc03e98e0dc2b855be647c39abe984193675`
- `did:ethr:myprivatenet:0xabcabc03e98e0dc2b855be647c39abe984193675`
- `did:ethr:0x1e240:0xabcabc03e98e0dc2b855be647c39abe984193675` (refer to `myprivatenet` by chainID)

For each network you can specify either an `rpcUrl`, a `provider` or a `web3` instance that can be used to access that
particular network. At least one of `name` or `chainId` must be specified per network.

These providers will have to support `eth_call` and `eth_getLogs` to be able to resolve DIDs specific to that network.

You can also override the default registry address by specifying a `registry` attribute per network.

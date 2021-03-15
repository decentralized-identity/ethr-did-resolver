---
title: "Ethr DID Resolver"
index: 7 category: "ethr-did-resolver"
type: "reference"
source: "https://github.com/decentralized-identity/ethr-did-resolver/blob/develop/README.md"
---

# ethr DID Resolver

[![codecov](https://codecov.io/gh/decentralized-identity/ethr-did-resolver/branch/develop/graph/badge.svg)](https://codecov.io/gh/decentralized-identity/ethr-did-resolver)
[![CircleCI](https://circleci.com/gh/decentralized-identity/ethr-did-resolver.svg?style=svg)](https://circleci.com/gh/decentralized-identity/ethr-did-resolver)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/7bcde296af8e467787b04c956c2c9f6f)](https://www.codacy.com/manual/uport-project/ethr-did-resolver?utm_source=github.com&utm_medium=referral&utm_content=uport-project/ethr-did-resolver&utm_campaign=Badge_Grade)

This library is intended to use ethereum addresses as fully self managed
[Decentralized Identifiers](https://w3c-ccg.github.io/did-spec/#decentralized-identifiers-dids) and wrap them in a
[DID Document](https://w3c-ccg.github.io/did-spec/#did-documents)

It supports the proposed [Decentralized Identifiers](https://w3c-ccg.github.io/did-spec/) spec from the
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
represents a distinct identifier than the generic one.

## DID Document

The did resolver takes the ethereum address, checks for the current controller, looks at contract events and builds a
simple DID document.

The minimal DID document for a an ethereum address `0xb9c5714089478a327f09197987f16f9e5d936e8a` with no transactions to
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
  "authentication": ["did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a#controller"]
}
```

Note this uses the `EcdsaSecp256k1RecoveryMethod2020` type and an `blockchainAccountId` to represent the default
verification method and authentication entry.

## Building a DID document

The DID document is built by using read only functions and contract events on
the [ethr-did-registry](https://github.com/uport-project/ethr-did-registry) Ethereum smart contract.

Any value from the registry that returns an ethereum address will be added to the `verificationMethod` array of the DID document
with type `EcdsaSecp256k1RecoveryMethod2020` and an `blockchainAccountId` attribute containing the address.

### Controller Address

Each identity always has a controller address. By default it's the same as the identity address, but check the read only
contract function `identityOwner(address identity)` on the deployed version of the EthrDIDRegistry contract.

The Identity controller will always have a `verificationMethod` with the id set as the DID with the fragment `#controller`
appended.

An entry is also added to the `authentication` array of the DID document with the id of the controller publicKey.

### Enumerating contract events for an identity

The `EthereumDIDRegistry` contract publishes 3 types of events for each identity.

- `DIDOwnerChanged` (indicating a change of controller)
- `DIDDelegateChanged`
- `DIDAttributeChanged`

If a change has ever been made for an identity the block number is stored in the `changed` mapping.

The latest event can be efficiently looked up by checking for one of the 3 above events at that exact block.

Each event contains a `previousChange` value which contains the block number of the previous change (if any)

To see all changes in history for an identity use the following pseudo code:

1. call `changed(address identity)` contract
2. if result is null return
3. filter for events for all the above types with the contracts address on the specified block
4. if event has a previous change then go to 3

### Delegate Keys

Delegate Keys are ethereum addresses that can either be general signing keys or optionally also perform authentication.

They are also verifiable from solidity (see [ethr-did-registry](https://github.com/uport-project/ethr-did-registry) for
more info).

A `DIDDelegateChanged` event is published that is used to build a DID.

```solidity
event DIDDelegateChanged(
  address indexed identity,
  bytes32 delegateType,
  address delegate,
  uint validTo,
  uint previousChange
);
```

The only 2 delegateTypes that are currently published in the DID Document are:

- `veriKey` Which adds a `EcdsaSecp256k1RecoveryMethod2020` to the `verificationMethod` section of document
- `sigAuth` Which adds a `EcdsaSecp256k1RecoveryMethod2020` to the `verificationMEthod` section of document and then
  references it in the 'authentication` section of document.

**Note** The `delegateType` is a `bytes32` type for Ethereum gas efficiency reasons and not a string. This restricts us
to 32 bytes, which is why we use the short hand versions above.

Only events with a `validTo` in seconds greater or equal to current time should be included in the DID document.

### Non Ethereum Attributes

Non ethereum keys, service elements etc can be added using attributes. Attributes only exist on the blockchain as
contract events of type `DIDAttributeChanged` and can thus not be queried from within solidity code.

```solidity
event DIDAttributeChanged(
  address indexed identity,
  bytes32 name,
  bytes value,
  uint validTo,
  uint previousChange
);
```

**Note** The `name` is a `bytes32` type for Ethereum gas efficiency reasons and not a string. This restricts us to 32
bytes, which is why we use the short hand attribute versions below.

While any attribute can be stored. For the DID document we currently support adding to each of these sections of the DID
document:

- [`Public Keys`](https://w3c-ccg.github.io/did-spec/#public-keys)
- [`Service Endpoints`](https://w3c-ccg.github.io/did-spec/#service-endpoints)

### Public Keys

The name of the attribute should follow this format:

`did/pub/(Secp256k1|RSA|Ed25519|X25519)/(veriKey|sigAuth|enc)/(hex|base64|base58)`

(Essentially `did/pub/<key algorithm>/<key purpose>/<encoding>`)

#### Key purposes

- `veriKey` adds the corresponding verification key to the `verificationMethod` section of document
- `sigAuth` adds the corresponding verification key to the `verificationMethod` section of document and adds an entry to
  the `authentication` section of document.
- `enc` adds a key agreement key to the `verificationMethod` section. This is used to perform a Diffie-Hellman key
  exchange and derive a secret key for encrypting messages to the DID that lists such a key.

> **Note** The `<encoding>` only refers to the key encoding in the resolved DID document.
> Attribute values sent to the ERC1056 registry should always be hex encoded.

#### Example hex encoded Secp256k1 Verification Key

A `DIDAttributeChanged` event for the identity `0xf3beac30c498d9e26865f34fcaa57dbb935b0d74` with the name
`did/pub/Secp256k1/veriKey/hex` and the value of `0x02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71`
generates a `verificationMethod` entry like this:

```json
{
  "id": "did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74#delegate-1",
  "type": "EcdsaSecp256k1VerificationKey2019",
  "controller": "did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74",
  "publicKeyHex": "02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71"
}
```

#### Base64 encoded Ed25519 Verification Key

A `DIDAttributeChanged` event for the identity `0xf3beac30c498d9e26865f34fcaa57dbb935b0d74` with the name
`did/pub/Ed25519/veriKey/base64` and the value of
`0xb97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71` generates a `verificationMethod` entry like this:

```javascript
{
  id: "did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74#delegate-1",
  type: "Ed25519VerificationKey2018",
  controller: "did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74",
  publicKeyBase64: "uXww3nZ/CEzjCAFo7ikwU7ozsjXXEWoyY9KfFFCTa3E="
}
```

#### Base64 encoded X25519 Encryption Key

A `DIDAttributeChanged` event for the identity `0xf3beac30c498d9e26865f34fcaa57dbb935b0d74` with the name
`did/pub/X25519/enc/base64` and the value of
`0x302a300506032b656e032100118557777ffb078774371a52b00fed75561dcf975e61c47553e664a617661052`
generates a `verificationMethod` entry like this:

```json
{
  "id": "did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74#delegate-1",
  "type": "X25519KeyAgreementKey2019",
  "controller": "did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74",
  "publicKeyBase64": "MCowBQYDK2VuAyEAEYVXd3/7B4d0NxpSsA/tdVYdz5deYcR1U+ZkphdmEFI="
}
```

We are looking for people to submit support for `pem`, `base58` and `jwk` key formats as well.

### Service Endpoints

The name of the attribute should follow this format:

`did/svc/[ServiceName]`

Example:

A `DIDAttributeChanged` event for the identity `0xf3beac30c498d9e26865f34fcaa57dbb935b0d74` with the name
`did/svc/HubService` and value of the URL `https://hubs.uport.me` hex encoded as
`0x68747470733a2f2f687562732e75706f72742e6d65` generates a service endpoint entry like the following:

```json
{
  "id": "did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74#service-1",
  "type": "HubService",
  "serviceEndpoint": "https://hubs.uport.me"
}
```

## Resolving a DID document

The library presents a `resolver()` function that returns a ES6 Promise returning the DID document. It is not meant to
be used directly but through the
[`did-resolver`](https://github.com/decentralized-identity/did-resolver) aggregator. You can use the `getResolver(conf)`
method to produce an entry that can be used with the `Resolver`
constructor.

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

The configuration from above allows you to resolve ethr-did's of the formats:

- `did:ethr:mainnet:0xabcabc03e98e0dc2b855be647c39abe984193675`
- `did:ethr:0xabcabc03e98e0dc2b855be647c39abe984193675` (defaults to mainnet configuration)
- `did:ethr:0x4:0xabcabc03e98e0dc2b855be647c39abe984193675` (refer to the rinkeby network by chainID)
- `did:ethr:rsk:testnet:0xabcabc03e98e0dc2b855be647c39abe984193675`
- `did:ethr:development:0xabcabc03e98e0dc2b855be647c39abe984193675`
- `did:ethr:myprivatenet:0xabcabc03e98e0dc2b855be647c39abe984193675`

For each network you can specify either an `rpcUrl`, a `provider` or a `web3` instance that can be used to access that
particular network.

These providers will have to support `eth_call` and `eth_getLogs` to be able to resolve DIDs specific to that network.

You can also override the default registry address by specifying a `registry` attribute per network.

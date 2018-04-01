# ethr DID Resolver

This library is intended to use ethereum addresses as fully self managed [Decentralized Identifiers](https://w3c-ccg.github.io/did-spec/#decentralized-identifiers-dids) and wrap them in a [DID Document](https://w3c-ccg.github.io/did-spec/#did-documents)

It supports the proposed [Decentralized Identifiers](https://w3c-ccg.github.io/did-spec/) spec from the [W3C Credentials Community Group](https://w3c-ccg.github.io).

It requires the `did-resolver` library, which is the primary interface for resolving DIDs.

The DID method relies on the [ethr-did-registry](https://github.com/uport-project/ethr-did-registry).

## DID method

To encode a DID for an Ethereum address, simply prepend `did:ethr:`

eg:

`did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74`

## DID Document

The did resolver takes the ethereum address, checks for the current owner, looks at contract events and builds a simple DID document.

The minimal DID document for a an ethereum address `0xf3beac30c498d9e26865f34fcaa57dbb935b0d74` with no transactions to the registry looks like this:

```js
{
  '@context': 'https://w3id.org/did/v1',
  id:'did:eth:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74',
  publicKey: [{
    id: 'did:eth:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74#owner',
    type: 'Secp256k1VerificationKey2018',
    owner: 'did:eth:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74',
    ethereumAddress: '0xf3beac30c498d9e26865f34fcaa57dbb935b0d74'
  }],
  authentication: [{
    type: 'Secp256k1SignatureAuthentication2018',
    publicKey: 'did:eth:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74#owner'
  }]
}
```

Note this uses the `Secp256k1VerificationKey2018` type and an `ethereumAddress` instead of a `publicKeyHex`.

## Building a DID document

The DID document is built by using read only functions and contract events on the [ethr-did-registry](https://github.com/uport-project/ethr-did-registry) Ethereum smart contract.

Any value from the registry that returns an ethereum address will be added to the `publicKey` array of the DID document with type `Secp256k1VerificationKey2018` and an `ethereumAddress` attribute containing the address.

### Owner Address

Each identity always has an owner address. By default it's the same as the identity address, but check the read only contract function `identityOwner(address identity)` on the deployed version of the EthrDIDRegistry contract.

The Identity owner will always have a `publicKey` with the id set as the DID with the fragment `#owner` appended.

An entry is also added to the `authentication` array of the DID document with type `Secp256k1SignatureAuthentication2018`.

### Enumerating contract events for an identity

The `EthereumDIDRegistry` contract publishes 3 types of events for each identity.

- `DIDOwnerChanged`
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

They are also verifiable from solidity (see [ethr-did-registry](https://github.com/uport-project/ethr-did-registry) for more info).

A `DIDDelegateChanged` event is published that is used to build a DID. 

```solidity
event DIDDelegateChanged(
    address indexed identity,
    string delegateType,
    address delegate,
    uint validTo,
    uint previousChange
  );
```

The only 2 delegateTypes that are currently published in the DID Document are:

- `Secp256k1VerificationKey2018` which is added to the `publicKey` section of document
- `Secp256k1SignatureAuthentication2018` which is also added to the `publicKey` section of document. An entry is also added to the `authentication` section of document

Only events with a `validTo` in seconds greater or equal to current time should be included in the DID document.

### Non Ethereum Attributes

Non ethereum keys, service elements etc can be added using attributes. Attributes only exist on the blockchain as contract events of type `DIDAttributeChanged` and can thus not be queried from within solidity code.

```solidity
event DIDAttributeChanged(
    address indexed identity,
    string name,
    bytes value,
    uint validTo,
    uint previousChange
  );
```

While any attribute can be stored. For the DID document we currently support adding to each of these sections of the DID document:

- [`Public Keys`](https://w3c-ccg.github.io/did-spec/#public-keys)
- [`Service Endpoints`](https://w3c-ccg.github.io/did-spec/#service-endpoints)

The name of the attribute should follow this format:

`did/[section]/[type]/[encoding]` with encoding being optional.

|section|type|encoding|
|-------|----|--------|
|`publicKey`| Any valid Public Key type eg. `Secp256k1VerificationKey2018`, `Ed25519VerificationKey2018`, `RsaVerificationKey2018` | `publicKeyHex` (default), `publicKeyBase64` (please submit PRs for `publicKeyPem`, `publicKeyJwk`, `publicKeyBase58`)|
|`service`| Any valid service type eg `HubService`, `AgentService` | n/a |

Values should be encoded in binary bytes for efficiency reasons. Encoding in the DID document will be converted according to method. Any unsupported attributes and unknown encodings will be ignored.

## Resolving a DID document

The resolver presents a simple `resolver()` function that returns a ES6 Promise returning the DID document.

```js
import resolve from 'did-resolver'
import registerResolver from 'ethr-did-resolver'

registerResolver()

resolve('did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74').then(doc => console.log)

// You can also use ES7 async/await syntax
const doc = await resolve('did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74')
```

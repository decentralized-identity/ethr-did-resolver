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

The did resolver takes the ethereum address and wraps it into a simple DID document:

```js
{
  '@context': 'https://w3id.org/did/v1',
  id:'did:eth:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74',
  publicKey: [{
    id: `did:eth:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74#keys-1`,
    type: 'Secp256k1VerificationKey2018',
    owner: 'did:eth:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74',
    ethereumAddress: '0xf3beac30c498d9e26865f34fcaa57dbb935b0d74'
  }]
}
```

Note this uses the `Secp256k1VerificationKey2018` type and an `ethereumAddress` instead of a `publicKeyHex`.

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

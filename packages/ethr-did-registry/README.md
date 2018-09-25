---
title: "Ethereum DID Registry"
index: 6
category: "ethr-did-registry"
type: "reference"
source: "https://github.com/uport-project/ethr-did-registry/blob/develop/README.md"
---

# Ethereum DID Registry

This contract allows on-chain and off-chain resolving and management for [DIDs (Decentralized Identifiers)](https://w3c-ccg.github.io/did-spec/).

A DID is an [Identifier](https://w3c-ccg.github.io/did-spec/#decentralized-identifiers-dids) that allows you to lookup a [DID document](https://w3c-ccg.github.io/did-spec/#did-documents) that can be used to authenticate you and messages created by you.

It's designed for resolving public keys for off-chain authentication&mdash;where the public key resolution is handled by using decentralized technology.

This contract allows Ethereum addresses to present signing information about themselves with no prior registration. It allows them to perform key rotation and specify different keys and services that are used on its behalf for both on and off-chain usage.

## Contract Deployments
|Network|Address|
| --|--|
|Mainnet (id: 1)|[0xdca7ef03e98e0dc2b855be647c39abe984fcf21b](https://etherscan.io/address/0xdca7ef03e98e0dc2b855be647c39abe984fcf21b)|
|Ropsten (id: 3)|[0xdca7ef03e98e0dc2b855be647c39abe984fcf21b](https://ropsten.etherscan.io/address/0xdca7ef03e98e0dc2b855be647c39abe984fcf21b)|
|Rinkeby (id: 4)|[0xdca7ef03e98e0dc2b855be647c39abe984fcf21b](https://rinkeby.etherscan.io/address/0xdca7ef03e98e0dc2b855be647c39abe984fcf21b)|
|Kovan (id: 42)|[0xdca7ef03e98e0dc2b855be647c39abe984fcf21b](https://kovan.etherscan.io/address/0xdca7ef03e98e0dc2b855be647c39abe984fcf21b)|


## Using the Registry

The DID Registry can be used from JavaScript as well as directly from other contracts.

To use the contract, we provide truffle artifacts. Once you require the `Ethr-DID-Registry` module, you will get an object containing the JSON.

```javascript
const DidRegistryContract = require('ethr-did-registry')
```

 You can use `truffle-contract` to utilize these artifacts.

```javascript
const Contract = require('truffle-contract')
let DidReg = Contract(DidRegistryContract)
DidReg.setProvider(web3.currentProvider)
let didReg = DidReg.deployed()
```

You can also use web3.

```javascript
let networkId = 1 // Mainnet
let DidReg = web3.eth.contract(DidRegistryContract.abi)
let didReg = DidReg.at(DidRegistryContract.networks[networkId].address)
```
## On-chain vs. Off-chain
For on-chain interactions Ethereum has a built-in account abstraction that can be used regardless of whether the account is a smart contract or a key pair. Any transaction has a `msg.sender` as the verified send of the transaction.

Since each Ethereum transaction must be funded, there is a growing trend of on-chain transactions that are authenticated via an externally created signature and not by the actual transaction originator. This allows for 3rd party funding services, or for receivers to pay without any fundamental changes to the underlying Ethereum architecture.

These kinds of transactions have to be signed by an actual key pair and thus cannot be used to represent smart contract based Ethereum accounts.

We propose a way of a smart contract or regular key pair delegating signing for various purposes to externally managed key pairs. This allows a smart contract to be represented, both on-chain as well as off-chain or in payment channels through temporary or permanent delegates.

## Identity Identifier
Any Ethereum account regardless of whether it's a key pair or smart contract based is considered to be an account identifier.

An identity needs no registration.

## Identity Ownership
Each identity has a single address which maintains ultimate control over it. By default, each identity is controlled by itself. As ongoing technological and security improvements occur, an owner can replace themselves with any other Ethereum address, such as an advanced multi-signature contract.

There is only ever a single identity owner. More advanced ownership models are managed through a multi-signature contract.

### Looking up Identity Ownership
Ownership of identity is verified by calling the `identityOwner(address identity) public view returns(address)` function. This returns the address of the current Identity Owner.

### Changing Identity Ownership
The account owner can replace themselves at any time, by calling the `changeOwner(address identity, address newOwner)` function.

There is also a version of this function which is called with an externally created signature, that is passed to a transaction funding service.

The externally signed version has the following signature `changeOwnerSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, address newOwner)`.

The signature should be signed of the keccak256 hash of the following tightly packed parameters:

`byte(0x19), byte(0), address of registry, nonce[currentOwner], identity, "changeOwner", newOwner`

## Delegates
Delegates are addresses that are delegated for a specific time to perform a function on behalf of an identity.

They can be accessed both on and off-chain.

### Delegate Types
The type of function is simply a string, that is determined by a protocol or application higher up.

Examples:
- ‘DID-JWT’
- ‘Raiden’

### Validity
Delegates expire. The expiration time is application specific and dependent on the security requirements of the identity owner.

Validity is set using the number of seconds from the time that adding the delegate is set.

### Looking up a Delegate
You can check to see if an address is a delegate for an identity using the`validDelegate(address identity, string delegateType, address delegate) returns(bool)` function. This returns true if the address is a valid delegate of the given delegateType.

### Adding a Delegate

An identity can assign multiple delegates to manage signing on their behalf for specific purposes.

The account owner can call the `addDelegate(address identity, string delegateType, address delegate, uint validity)` function.

There is also a version of this function which is called with an externally created signature, that is passed to a transaction funding service.

The externally signed version has the following signature `addDelegateSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, string delegateType, address delegate, uint validity)`.

The signature should be signed of the keccak256 hash of the following tightly packed parameters:

`byte(0x19), byte(0), address of registry, nonce[currentOwner], identity, "addDelegate", delegateType, delegate, validity`

### Revoking a Delegate

A delegate may be manually revoked by calling the `revokeDelegate(address identity, string delegateType, address delegate)` function.

There is also a version of this function which is called with an externally created signature, that is passed to a transaction funding service.

The externally signed version has the following signature `revokeDelegateSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, string delegateType, address delegate)`.

The signature should be signed of the keccak256 hash of the following tightly packed parameters:

`byte(0x19), byte(0), address of registry, nonce[currentOwner], identity, "revokeDelegate", delegateType, delegate`

### Enumerating Delegates Off-chain

Attributes are stored as `DIDDelegateChanged` events. A `validTo` of 0 indicates a revoked delegate.

```solidity
event DIDDelegateChanged(
    address indexed identity,
    string delegateType,
    address delegate,
    uint validTo,
    uint previousChange
  );
```

## Adding Off-chain Attributes
An identity may need to publish some information that is only needed off-chain but still requires the security benefits of using a blockchain.

### Setting Attributes

These attributes are set using the `setAttribute(address identity, string name, bytes value, uint validity)` function and published using events.

There is also a version of this function that is called with an externally created signature, that is passed to a transaction funding service.

The externally signed version has the following signature `setAttributeSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, string name, bytes value, uint validity)`.

The signature should be signed off the keccak256 hash of the following tightly packed parameters:

`byte(0x19), byte(0), address of registry, nonce[currentOwner], identity, "setAttribute", name, value, validity`

### Revoking Attributes

These attributes are revoked using the `revokeAttribute(address identity, string name, bytes value)` function and published using events.

There is also a version of this function that is called with an externally created signature, that is passed to a transaction funding service.

The externally signed version has the following signature `revokeAttributeSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, string name, bytes value)`.

The signature should be signed off the keccak256 hash of the following tightly packed parameters:

`byte(0x19), byte(0), address of registry, nonce[currentOwner], identity, "revokeAttribute", name, value`

### Reading attributes

Attributes are stored as `DIDAttributeChanged` events. A `validTo` of 0 indicates a revoked attribute.

```solidity
event DIDAttributeChanged(
    address indexed identity,
    string name,
    bytes value,
    uint validTo,
    uint previousChange
  );
```

## Enumerating Linked Identity Events

Contract Events are a useful feature for storing data from smart contracts exclusively for off-chain use. Unfortunately, current Ethereum implementations provide a very inefficient lookup mechanism.

By using linked events that always link to the previous block with a change to the identity, we can solve this problem with improved performance.

Each identity has its previously changed block stored in the `changed` mapping.

1. Lookup `previousChange` block for identity
2. Lookup all events for a given identity address using web3, but only for the `previousChange` block
3. Do something with the event
4. Find `previousChange` from the event and repeat

Example code

```js
const history = []
previousChange = await didReg.changed(identity)
while (previousChange) {
  const filter = await didReg.allEvents({topics: [identity], fromBlock: previousChange, toBlock: previousChange})
  const events = await getLogs(filter)
  previousChange = undefined
  for (let event of events) {
    history.unshift(event)
    previousChange = event.args.previousChange
  }
}
```

## Assemble a DID Document

The primary owner key should be looked up using `identityOwner(identity)`. This should be the first of the public keys listed.

Iterate through the `DIDDelegateChanged` events to build a list of additional keys and authentication sections as needed. The list of delegateTypes to include is still to be determined.

Iterate through `DIDAttributeChanged` events for service entries, encrypted public keys, and other public names. The attribute names are still to be determined.

## Deploy contract
First run,
```
$ scripts/generateDeployTxs.js
```
You will get the data needed to deploy as an output from this command. Copy the `senderAddress` and send `cost` amount of ether to that address on the Ethereum network you wish to deploy to. Once this tx is confirmed, simply send the `rawTx` to the same network. `contractAddress` is the address of the deployed contract. This will be the same on all networks it's deployed to.

## Testing the Contracts

Make sure you have truffle installed, then run:
```
$ truffle test
```

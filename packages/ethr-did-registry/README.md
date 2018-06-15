## Ethereum DID Registry

This contract allows on and off-chain resolving and management for [DIDs (Decentralized IDentifiers)](https://w3c-ccg.github.io/did-spec/).

A DID is an [Identifier](https://w3c-ccg.github.io/did-spec/#decentralized-identifiers-dids) that allows you to lookup a [DID document](https://w3c-ccg.github.io/did-spec/#did-documents) that can be used to authenticate you and messages created by you.

It was designed as a way of resolving public keys for off chain authentication, where the public key resolution is handled through the use of decentralized technology.

This contract allows ethereum addresses to present signing information about themselves with no prior registration. It allows them to perform key rotation and specify different keys and services that can be used on it's behalf for both on and off-chain usage.

## Using the registry

The DID Registry can be used from javascript as well as directly from other contracts.

### From javascript

To use the contract we provide truffle artifacts. Once you require the `ethr-did-registry` module you will get an object containing the json.

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

## Contract Deployments
|Network|Address|
| --|--|
|Mainnet (id: 1)|[0xdca7ef03e98e0dc2b855be647c39abe984fcf21b](https://etherscan.io/address/0xdca7ef03e98e0dc2b855be647c39abe984fcf21b)|
|Ropsten (id: 3)|[0xdca7ef03e98e0dc2b855be647c39abe984fcf21b](https://ropsten.etherscan.io/address/0xdca7ef03e98e0dc2b855be647c39abe984fcf21b)|
|Rinkeby (id: 4)|[0xdca7ef03e98e0dc2b855be647c39abe984fcf21b](https://rinkeby.etherscan.io/address/0xdca7ef03e98e0dc2b855be647c39abe984fcf21b)|
|Kovan (id: 42)|[0xdca7ef03e98e0dc2b855be647c39abe984fcf21b](https://kovan.etherscan.io/address/0xdca7ef03e98e0dc2b855be647c39abe984fcf21b)|

## On-chain vs Off-chain
For on-chain interactions Ethereum has a built in account abstraction that can be used regardless of whether the account is a smart contract or a key pair. Any transaction has a `msg.sender` as the verified send of the transaction.

Since each Ethereum transaction has to be funded, there is a growing trend of on-chain transactions that are authenticated via an externally created signature and not by the actual transaction originator. This allows 3rd party funding services or receiver pays without any fundamental changes to the underlying Ethereum architecture.

These kinds of transactions have to be signed by an actual key pair and thus can not be used to represent smart contract based Ethereum accounts.

We propose a way of a Smart Contract or regular key pair delegating signing for various purposes to externally managed key pairs. This allows a smart contract to be represented both on-chain as well as off-chain or in payment channels through temporary or permanent delegates.

## Identity Identifier
Any ethereum account regardless of it being a key pair or smart contract based is considered to be an account identifier.

No registration is needed by an identity.

## Identity Ownership
Each identity has a single address which maintains ultimate control over it. By default each identity is controlled by itself. As ongoing technological and security improvements happen an owner can replace themselves with any other ethereum address, such as an advanced multi signature contract.

There is only ever a single identity owner. More advanced ownership models can be managed through a multi signature contract.

### Looking up Identity Ownership
Ownership of an identity can be verified by calling the `identityOwner(address identity) public view returns(address)` function. This returns the address of the current Identity Owner.

### Changing Identity Ownership
The account owner can replace themselves at any time, by calling the `changeOwner(address identity, address newOwner)` function.

There is also a version of this function which can be called with an externally created signature, that can be passed to a transaction funding service.

The externally signed version has the following signature `changeOwnerSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, address newOwner)`.

The signature should be signed of the keccak256 hash of the following tightly packed parameters:

`byte(0x19), byte(0), address of registry, nonce[currentOwner], identity, "changeOwner", newOwner`

## Delegates
Delegates are addresses that are delegated for a specific time to perform some sort of function on behalf of an identity.

They can be accessed both on and off-chain.

### Delegate Types
The type of function is simply a string, that is determined by a protocol or application higher up.

Examples:
- ‘did-jwt’
- ‘raiden’

### Validity
Delegates expire. Expiration time is application specific and also dependent on the security requirements of the identity owner.

Validity is set using amount of seconds from the time that adding the delegate is set.

### Looking up a delegate
You can check if an address is a delegate for an identity using the`validDelegate(address identity, string delegateType, address delegate) returns(bool)` function. This returns true if the address is a valid delegate of the given delegateType.

### Adding a delegate

An identity can assign multiple delegates to manage signing on their behalf for specific purposes.

The  account owner can call the `addDelegate(address identity, string delegateType, address delegate, uint validity)` function.

There is also a version of this function which can be called with an externally created signature, that can be passed to a transaction funding service.

The externally signed version has the following signature `addDelegateSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, string delegateType, address delegate, uint validity)`.

The signature should be signed of the keccak256 hash of the following tightly packed parameters:

`byte(0x19), byte(0), address of registry, nonce[currentOwner], identity, "addDelegate", delegateType, delegate, validity`

### Revoking a delegate

A delegate may be manually revoked by calling the `revokeDelegate(address identity, string delegateType, address delegate)` function.

There is also a version of this function which can be called with an externally created signature, that can be passed to a transaction funding service.

The externally signed version has the following signature `revokeDelegateSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, string delegateType, address delegate)`.

The signature should be signed of the keccak256 hash of the following tightly packed parameters:

`byte(0x19), byte(0), address of registry, nonce[currentOwner], identity, "revokeDelegate", delegateType, delegate`

### Enumerating delegates off chain

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

## Adding off-chain attributes
An identity may need to publish some information that is only needed off-chain, but still requires the security benefits of using a blockchain.

### Setting attributes

These attributes are set using the `setAttribute(address identity, string name, bytes value, uint validity)` function and published using events.

There is also a version of this function which can be called with an externally created signature, that can be passed to a transaction funding service.

The externally signed version has the following signature `setAttributeSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, string name, bytes value, uint validity)`.

The signature should be signed of the keccak256 hash of the following tightly packed parameters:

`byte(0x19), byte(0), address of registry, nonce[currentOwner], identity, "setAttribute", name, value, validity`

### Revoking attributes

These attributes are revoked using the `revokeAttribute(address identity, string name, bytes value)` function and published using events.

There is also a version of this function which can be called with an externally created signature, that can be passed to a transaction funding service.

The externally signed version has the following signature `revokeAttributeSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, string name, bytes value)`.

The signature should be signed of the keccak256 hash of the following tightly packed parameters:

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

## Efficient lookup of events through linked identity events

Contract Events are a useful feature for storing data from smart contracts exclusively for off-chain use.  Unfortunately current ethereum implementations provide a very inefficient lookup mechanism.

By using linked events, that always link to the previous block with a change for the identity we can solve this problem with much improved performance.

Each identity has it’s previously changed block stored in the `changed` mapping.

1. Lookup `previousChange` block for identity
2. Lookup all events for given identity address using web3, but only for the `previousChange` block
3. Do something with event
4. Find `previousChange` from the event  and repeat

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

## Building a DID document for an identity

The primary owner key should be looked up using `identityOwner(identity)`.  This should be the first of the publicKeys listed.

Iterate through the `DIDDelegateChanged` events to build a list of additional keys and authentication sections as needed. The list of delegateTypes to include is still to be determined.

Iterate through `DIDAttributeChanged` events for service entries, encryption public keys and other public names. The attribute names are still to be determined.

## Deploy contract
First run,
```
$ scripts/generateDeployTxs.js
```
you will get the data needed to deploy as an output from this command. Copy the `senderAddress` and send `cost` amount of ether to this address on the ethereum network you wish to deploy to. Once this tx is confirmed simply send the `rawTx` to the same network. `contractAddress` is the address of the deployed contract. This will be the same on all networks it is deployed to.

## Testing the contracts

Make sure you have truffle installed then simply run:
```
$ truffle test
```

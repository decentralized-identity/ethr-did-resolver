---
title: 'Ethereum DID Registry'
index: 0
category: 'ethr-did-registry'
type: 'reference'
source: 'https://github.com/uport-project/ethr-did-registry/blob/develop/README.md'
---

# Ethereum DID Registry

This library contains the Ethereum contract code that allows the owner of an ethr-did identity to update the attributes
that appear in its did-document. It exposes an API that allows developers to call the contract functions using
Javascript.

Use this if you want to interact directly with a deployed registry contract directly, or deploy a copy of the contract
to another Ethereum network.

A DID is an [Identifier](https://w3c.github.io/did-core/#a-simple-example) that allows you to lookup
a [DID document](https://w3c.github.io/did-core/#example-a-simple-did-document) that can be used to authenticate you and
messages created by you.

It's designed for resolving public keys for off-chain authentication—where the public key resolution is handled by using
decentralized technology.

This contract allows Ethereum addresses to present signing information about themselves with no prior registration. It
allows them to perform key rotation and specify different keys and services that are used on its behalf for both on and
off-chain usage.

## Contract Deployments

> WARNING
> Most of these are deployments of version 0.0.3 of the contract and they do not include recent updates.
> Join the discussion as to how to adopt these new changes [on our discord](https://discord.gg/MTeTAwSYe7)

| Network Name          | name            | chainId    | hexChainId | Registry Address                                                                                                                       | Registry version                                                                                                  |
|-----------------------|-----------------|------------|------------|----------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------|
| Mainnet               | mainnet         | 1          | 0x1        | [0xdca7...f21b](https://etherscan.io/address/0xdca7ef03e98e0dc2b855be647c39abe984fcf21b)                  | [4278342e](https://github.com/uport-project/ethr-did-registry/commit/4278342e9b1dec0ab4fd63f4bd5536094c4de9f0)    |
| ~~Ropsten~~           |                 | 3          | 0x3        | [0xdca7...f21b](https://ropsten.etherscan.io/address/0xdca7ef03e98e0dc2b855be647c39abe984fcf21b)          | [4278342e](https://github.com/uport-project/ethr-did-registry/commit/4278342e9b1dec0ab4fd63f4bd5536094c4de9f0)    |
| ~~Rinkeby~~           |                 | 4          | 0x4        | [0xdca7...f21b](https://rinkeby.etherscan.io/address/0xdca7ef03e98e0dc2b855be647c39abe984fcf21b)          | [4278342e](https://github.com/uport-project/ethr-did-registry/commit/4278342e9b1dec0ab4fd63f4bd5536094c4de9f0)    |
| ~~Goerli~~            |                 | 5          | 0x5        | [0xdca7...f21b](https://goerli.etherscan.io/address/0xdca7ef03e98e0dc2b855be647c39abe984fcf21b)           | [4278342e](https://github.com/uport-project/ethr-did-registry/commit/4278342e9b1dec0ab4fd63f4bd5536094c4de9f0)    |
| ~~Kovan~~             |                 | 42         | 0x2a       | [0xdca7...f21b](https://kovan.etherscan.io/address/0xdca7ef03e98e0dc2b855be647c39abe984fcf21b)            | [4278342e](https://github.com/uport-project/ethr-did-registry/commit/4278342e9b1dec0ab4fd63f4bd5536094c4de9f0)    |
| RSK                   | rsk             | 30         | 0x1e       | [0xdca7...f21b](https://explorer.rsk.co/address/0xdca7ef03e98e0dc2b855be647c39abe984fcf21b)               | [4278342e](https://github.com/uport-project/ethr-did-registry/commit/4278342e9b1dec0ab4fd63f4bd5536094c4de9f0)    |
| RSK Testnet           | rsk:test        | 31         | 0x1f       | [0xdca7...f21b](https://explorer.testnet.rsk.co/address/0xdca7ef03e98e0dc2b855be647c39abe984fcf21b)       | [4278342e](https://github.com/uport-project/ethr-did-registry/commit/4278342e9b1dec0ab4fd63f4bd5536094c4de9f0)    |
| EnergyWeb             | ewc             | 246        | 0xf6       | [0xe296...bce4](https://explorer.energyweb.org/address/0xE29672f34e92b56C9169f9D485fFc8b9A136BCE4)        | [c9063836](https://github.com/uport-project/ethr-did-registry/commit/c90638361a76d247d61ef4e3eb245a78cf587f91)    |
| EWC Volta             | volta           | 73799      | 0x12047    | [0xc15d...c4af](https://volta-explorer.energyweb.org/address/0xC15D5A57A8Eb0e1dCBE5D88B8f9a82017e5Cc4AF)  | [f4e17ee1](https://github.com/uport-project/ethr-did-registry/commit/f4e17ee1eb558c5a006bab1a04108f27d4e3f0d0)    |
| ~~ARTIS tau1~~        |                 | 246785     | 0x3c401    | [0xdca7...f21b](https://explorer.tau1.artis.network/address/0xdCa7EF03e98e0DC2B855bE647C39ABe984fcF21B)   | [4278342e](https://github.com/uport-project/ethr-did-registry/commit/4278342e9b1dec0ab4fd63f4bd5536094c4de9f0)    |
| ~~ARTIS sigma1~~      |                 | 246529     | 0x3c301    | [0xdca7...f21b](https://explorer.sigma1.artis.network/address/0xdCa7EF03e98e0DC2B855bE647C39ABe984fcF21B) | [4278342e](https://github.com/uport-project/ethr-did-registry/commit/4278342e9b1dec0ab4fd63f4bd5536094c4de9f0)    |
| Polygon               | polygon         | 137        | 0x89       | [0xdca7...f21b](https://polygonscan.com/address/0xdca7ef03e98e0dc2b855be647c39abe984fcf21b)               | [4278342e](https://github.com/uport-project/ethr-did-registry/commit/4278342e9b1dec0ab4fd63f4bd5536094c4de9f0)    |
| ~~Polygon test~~      |                 | 80001      | 0x13881    | [0xdca7...f21b](https://mumbai.polygonscan.com/address/0xdca7ef03e98e0dc2b855be647c39abe984fcf21b)        | [4278342e](https://github.com/uport-project/ethr-did-registry/commit/4278342e9b1dec0ab4fd63f4bd5536094c4de9f0)    |
| Aurora                | aurora          | 1313161554 | 0x4e454152 | [0x63ed...98e0](https://explorer.mainnet.aurora.dev/address/0x63eD58B671EeD12Bc1652845ba5b2CDfBff198e0)   | [0ab4f151](https://github.com/uport-project/ethr-did-registry/commit/0ab4f151ddde5b7739b97827c4fb901289f57892)    |
| ~~Arbitrum Goerli~~   |                 | 421613     | 0x66eed    | [0x8FFf...517E](https://goerli.arbiscan.io/address/0x8FFfcD6a85D29E9C33517aaf60b16FE4548f517E)            | [af1c2db](https://github.com/uport-project/ethr-did-registry/commit/af1c2db0e093507627338a6e562e0ed7c219b9ee)     |
| ~~Linea Goerli~~      |                 | 59140      | 0xe704     | [0x03d5...3818](https://goerli.lineascan.build/address/0x03d5003bf0e79c5f5223588f347eba39afbc3818)        | [af1c2db](https://github.com/uport-project/ethr-did-registry/commit/af1c2db0e093507627338a6e562e0ed7c219b9ee)     |
| Sepolia               | sepolia         | 11155111   | 0xaa36a7   | [0x03d5...3818](https://sepolia.etherscan.io/address/0x03d5003bf0e79c5f5223588f347eba39afbc3818#code)     | [af1c2db](https://github.com/uport-project/ethr-did-registry/commit/af1c2db0e093507627338a6e562e0ed7c219b9ee)     |
| Cardona               | cardona         | 2442       | 0x98a      | [0x03d5...3818](https://cardona-zkevm.polygonscan.com/address/0x03d5003bf0e79c5f5223588f347eba39afbc3818) | [0ab4f151](https://github.com/uport-project/ethr-did-registry/commit/0ab4f151ddde5b7739b97827c4fb901289f57892)    |
| Holešky               | holesky         | 17000      | 0x4268     | [0x03d5...3818](https://holesky.etherscan.io/address/0x03d5003bf0e79c5f5223588f347eba39afbc3818)          | [0ab4f151](https://github.com/uport-project/ethr-did-registry/commit/0ab4f151ddde5b7739b97827c4fb901289f57892)    |
| Gnosis Chain          | gno             | 100        | 0x64       | [0x03d5...3818](https://gnosisscan.io/address/0x03d5003bf0e79c5f5223588f347eba39afbc3818)                 | [0ab4f151](https://github.com/uport-project/ethr-did-registry/commit/0ab4f151ddde5b7739b97827c4fb901289f57892)    |

## Using the Registry

The DID Registry can be used from JavaScript as well as directly from other contracts.

To use the contract, we provide hardhat artifacts. Once you require the `ethr-did-registry` module, you will get an
object containing the JSON.

```javascript
const {EthereumDIDRegistry} = require('ethr-did-registry')
```

You can use [`ethers.js`](https://github.com/ethers-io/ethers.js/) to utilize these artifacts.

```javascript
const {ethers} = require('ethers')
const DidReg = new ethers.Contract(registryAddress, EthereumDIDRegistry.abi)
DidReg.connect(yourSignerOrProvider)
```

## On-chain vs. Off-chain

For on-chain interactions Ethereum has a built-in account abstraction that can be used regardless of whether the account
is a smart contract or a key pair. Any transaction has a `msg.sender` as the verified sender of the transaction.

Since each Ethereum transaction must be funded, there is a growing trend of on-chain transactions that are authenticated
via an externally created signature and not by the actual transaction originator. This allows for 3rd party funding
services, or for receivers to pay without any fundamental changes to the underlying Ethereum architecture.

These kinds of transactions have to be signed by an actual key pair and thus cannot be used to represent smart contract
based Ethereum accounts.

We propose a way of a smart contract or regular key pair delegating signing for various purposes to externally managed
key pairs. This allows a smart contract to be represented, both on-chain as well as off-chain or in payment channels
through temporary or permanent delegates.

## Identity Identifier

Any Ethereum account regardless of whether it's a key pair or smart contract based is considered to be an account
identifier.

An identity needs no registration.

## Identity Ownership

Each identity has a single address which maintains ultimate control over it. By default, each identity is controlled by
itself. As ongoing technological and security improvements occur, an owner can replace themselves with any other
Ethereum address, such as an advanced multi-signature contract.

There is only ever a single identity owner. More advanced ownership models are managed through a multi-signature
contract.

### Looking up Identity Ownership

Ownership of identity is verified by calling the `identityOwner(address identity) public view returns(address)`
function. This returns the address of the current Identity Owner.

### Changing Identity Ownership

The account owner can replace themselves at any time, by calling the `changeOwner(address identity, address newOwner)`
function.

There is also a version of this function which is called with an externally created signature, that is passed to a
transaction funding service.

The externally signed version has the following
signature `changeOwnerSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, address newOwner)`.

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

Delegates expire. The expiration time is application specific and dependent on the security requirements of the identity
owner.

Validity is set using the number of seconds from the time that adding the delegate is set.

### Looking up a Delegate

You can check to see if an address is a delegate for an identity using
the`validDelegate(address identity, bytes32 delegateType, address delegate) returns(bool)` function. This returns true
if the address is a valid delegate of the given delegateType.

### Adding a Delegate

An identity can assign multiple delegates to manage signing on their behalf for specific purposes.

The account owner can call the `addDelegate(address identity, bytes32 delegateType, address delegate, uint validity)`
function.

There is also a version of this function which is called with an externally created signature, that is passed to a
transaction funding service.

The externally signed version has the following
signature `addDelegateSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, bytes32 delegateType, address delegate, uint validity)`
.

The signature should be signed of the keccak256 hash of the following tightly packed parameters:

`byte(0x19), byte(0), address of registry, nonce[currentOwner], identity, "addDelegate", delegateType, delegate, validity`

### Revoking a Delegate

A delegate may be manually revoked by calling
the `revokeDelegate(address identity, string delegateType, address delegate)` function.

There is also a version of this function which is called with an externally created signature, that is passed to a
transaction funding service.

The externally signed version has the following
signature `revokeDelegateSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, bytes32 delegateType, address delegate)`
.

The signature should be signed of the keccak256 hash of the following tightly packed parameters:

`byte(0x19), byte(0), address of registry, nonce[currentOwner], identity, "revokeDelegate", delegateType, delegate`

### Enumerating Delegates Off-chain

Attributes are stored as `DIDDelegateChanged` events. A `validTo` of 0 indicates a revoked delegate.

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

An identity may need to publish some information that is only needed off-chain but still requires the security benefits
of using a blockchain.

### Setting Attributes

These attributes are set using the `setAttribute(address identity, bytes32 name, bytes value, uint validity)` function
and published using events.

There is also a version of this function that is called with an externally created signature, that is passed to a
transaction funding service.

The externally signed version has the following
signature `setAttributeSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, bytes32 name, bytes value, uint validity)`
.

The signature should be signed off the keccak256 hash of the following tightly packed parameters:

`byte(0x19), byte(0), address of registry, nonce[currentOwner], identity, "setAttribute", name, value, validity`

### Revoking Attributes

These attributes are revoked using the `revokeAttribute(address identity, bytes32 name, bytes value)` function and
published using events.

There is also a version of this function that is called with an externally created signature, that is passed to a
transaction funding service.

The externally signed version has the following
signature `revokeAttributeSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, bytes32 name, bytes value)`.

The signature should be signed off the keccak256 hash of the following tightly packed parameters:

`byte(0x19), byte(0), address of registry, nonce[currentOwner], identity, "revokeAttribute", name, value`

### Reading attributes

Attributes are stored as `DIDAttributeChanged` events. A `validTo` of 0 indicates a revoked attribute.

```solidity
event DIDAttributeChanged(
    address indexed identity,
    bytes32 name,
    bytes value,
    uint validTo,
    uint previousChange
);
```

### Delegate types and attribute names encoding

For gas cost reasons the names of attributes and types of delegates are fixed size `bytes32` values. In most situations,
this is not a problem since most can be represented by strings shorter than 32 bytes. To get a bytes32 value from them,
the recommended approach is to use the byte array representation of your string and right-pad it to get to 32 bytes.

## Enumerating Linked Identity Events

Contract Events are a useful feature for storing data from smart contracts exclusively for off-chain use. Unfortunately,
current Ethereum implementations provide a very inefficient lookup mechanism.

By using linked events that always link to the previous block with a change to the identity, we can solve this problem
with improved performance.

Each identity has its previously changed block stored in the `changed` mapping.

1. Lookup `previousChange` block for identity
2. Lookup all events for a given identity address using web3, but only for the `previousChange` block
3. Do something with the event
4. Find `previousChange` from the event and repeat

Example code

```js
const history = []
let prevChange = (await DidReg.changed(identityAddress)).toNumber()
while (prevChange) {
  const logs = await ethers.provider.getLogs({
    topics: [null, `0x000000000000000000000000${identityAddress}`],
    fromBlock: prevChange,
    toBlock: prevChange,
  })
  prevChange = 0
  for (const log of logs) {
    const logDescription = DidReg.interface.parseLog(log)
    history.unshift(logDescription)
    prevChange = logDescription.args.previousChange.toNumber()
  }
}
```

## Assemble a DID Document

The full spec describing how to interact with this registry to build a DID document can be found in
the [ehtr-did-resolver](https://github.com/decentralized-identity/ethr-did-resolver/blob/master/doc/did-method-spec.md)
repository.

In short, you would do something like this:

The primary owner key should be looked up using `identityOwner(identity)`. This should be the first of the public keys
listed.

Iterate through the `DIDDelegateChanged` events to build a list of additional keys and authentication sections as
needed. The list of delegateTypes to include is still to be determined.

Iterate through `DIDAttributeChanged` events for service entries, encrypted public keys, and other public names. The
attribute names are still to be determined.

## Deploy contract

First run,

```bash
$ scripts/generateDeployTxs.js
```

You will get the data needed to deploy as an output from this command.

Copy the `senderAddress` and send `cost` amount of ether to that address on the Ethereum network you wish to deploy to.

Once this funding transaction is confirmed, simply send the `rawTx` to the same network.
`contractAddress` is the address of the deployed contract.

`chainId` is intentionally not used in the transaction to make it simpler to deploy to the same address on all networks.

## Testing the Contracts

```bash
yarn install
yarn build
yarn test
```

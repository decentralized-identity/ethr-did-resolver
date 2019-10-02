# ETHR DID Method Specification

## Author

-   uPort Team: <https://www.uport.me/contact>

## Preface

The ethr DID method specification conforms to the requirements specified in 
the [DID specification](https://w3c-ccg.github.io/did-spec/), currently published by the 
W3C Credentials Community Group. For more information about DIDs and DID method specifications, 
please see the [DID Primer](https://github.com/WebOfTrustInfo/rebooting-the-web-of-trust-fall2017/blob/master/topics-and-advance-readings/did-primer.md)

## Abstract

Decentralized Identifiers (DIDs, see [1]) are designed to be compatible with any distributed ledger or network.
In the Ethereum community, a pattern known as ERC1056 (see [2]) utilizes a smart contract for a lightweight
identity management system intended explicitly for off-chain usage.

The described DID method allows any Ethereum smart contract or key pair account to become a valid identity.
An identity needs no registration. In the case that key management or additional
attributes such as "service endpoints" are required, we deployed ERC1056 smart contracts on:

-   Mainnet: `0xdca7ef03e98e0dc2b855be647c39abe984fcf21b`
-   Ropsten: `0xdca7ef03e98e0dc2b855be647c39abe984fcf21b`
-   Rinkeby: `0xdca7ef03e98e0dc2b855be647c39abe984fcf21b`
-   Kovan:   `0xdca7ef03e98e0dc2b855be647c39abe984fcf21b`
-   RSK:     `0xdca7ef03e98e0dc2b855be647c39abe984fcf21b`
-   RSK Testnet:`0xdca7ef03e98e0dc2b855be647c39abe984fcf21b`
-   Alastria Telsius:`0x05cc574b19a3c11308f761b3d7263bd8608bc532`

Since each Ethereum transaction must be funded, there is a growing trend of on-chain transactions that are
authenticated via an externally created signature and not by the actual transaction originator. This allows for
3rd party funding services, or for receivers to pay without any fundamental changes to the underlying
Ethereum architecture. These kinds of transactions have to be signed by an actual key pair and thus cannot be used 
to represent smart contract based Ethereum accounts. ERC1056 proposes a way of a smart contract or regular key pair 
delegating signing for various purposes to externally managed key pairs. This allows a smart contract to be
represented, both on-chain as well as off-chain or in payment channels through temporary or permanent delegates.

For a reference implementation of this DID method specification see [3].

### Identity Ownership 
By default, each identity is controlled by itself. Each identity can only be controlled by a single 
address at any given time. By default, this is the address of the identity itself. The owner can 
replace themselves with any other Ethereum address, including contracts to allow more advanced
models such as multi-signature ownership.

## Target System

The target system is the Ethereum network where the ERC1056 is deployed. This could either be:

-   Mainnet
-   Ropsten
-   Rinkeby
-   Kovan
-   other EVM-compliant blockchains such as private chains, or consortium chains.

### Advantages

-   No transaction fee on identity creation
-   Uses Ethereum's built-in account abstraction
-   Multi-sig wallet for identity owner
-   Decoupling claims data from the underlying identity
-   Decoupling Ethereum interaction from the underlying identity
-   Flexibility to use key management
-   Flexibility to allow third-party funding service to pay the gas fee if needed
-   Supports any EVM-compliant blockchain 

## JSON-LD Context Definition
Note, this DID method specification uses the `Secp256k1VerificationKey2018`, 
`Secp256k1SignatureAuthentication2018` types and an `ethereumAddress` instead of
a `publicKeyHex`.

The definition of the ethr DID JSON-LD context is:

  {
    "@context":
    {
      "ethereumAddress": "https://github.com/uport-project/ethr-did-resolver#ethereumAddress",
      "Secp256k1VerificationKey2018": "https://github.com/uport-project/ethr-did-resolver#Secp256k1VerificationKey2018",
      "Secp256k1SignatureAuthentication2018": "https://github.com/uport-project/ethr-did-resolver#Secp256k1VerificationKey2018",
    }
  }

## DID Method Name

The namestring that shall identify this DID method is: `ethr`

A DID that uses this method MUST begin with the following prefix: `did:ethr`. Per the DID specification, this string 
MUST be in lowercase. The remainder of the DID, after the prefix, is specified below.

## Method Specific Identifier

The method specific identifier is represented as the Hex-encoded Ethereum address
on the target network.

    ethr-did = "did:ethr:" ethr-specific-idstring
    ethr-specific-idstring = [ ethr-network ":" ] ethr-address
    ethr-network = "mainnet" / "ropsten" / "rinkeby" / "kovan"
    ethr-address = "0x" 40*HEXDIG

The Ethereum address is case-insensitive.

Note, if no public Ethereum network was specified, it is assumed that the DID is anchored
on the Ethereum mainnet per default. This means the following DIDs will resolve to the same
DID Document:

    did:ethr:mainnet:0xb9c5714089478a327f09197987f16f9e5d936e8a
    did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a

## CRUD Operation Definitions

### Create (Register)

In order to create a `ethr` DID, an Ethereum address, i.e., key pair, needs to be generated. At this point,
no interaction with the target Ethereum network is required. The registration is implicit as it is impossible to
brute force an Ethereum address, i.e., guessing the private key for a given public key on the Koblitz Curve
(secp256k). The holder of the private key is the entity identified by the DID.

The minimal DID document for a an Ethereum address, e.g., `0xf3beac30c498d9e26865f34fcaa57dbb935b0d74` with no
transactions to the ERC1056 registry looks like this:

  {
    '@context': 'https://w3id.org/did/v1',
    id: 'did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a',
    publicKey: [{
       id: 'did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a#owner',
       type: 'Secp256k1VerificationKey2018',
       owner: 'did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a',
       ethereumAddress: '0xb9c5714089478a327f09197987f16f9e5d936e8a'}],
    authentication: [{
       type: 'Secp256k1SignatureAuthentication2018',
       publicKey: 'did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a#owner'}]
  }

### Read (Resolve)

The DID document is built by using read only functions and contract events on the ERC1056 registry.

Any value from the registry that returns an Ethereum address will be added to the `publicKey` array of the DID 
document with type `Secp256k1VerificationKey2018` and an `ethereumAddress` attribute containing the address.

#### Owner Address

Each identity always has an owner address. By default it is the same as the identity address, but check the
read only contract function `identityOwner(address identity)` on the deployed version of the ERC1056 contract.

The identity owner will always have a `publicKey` with the id set as the DID with the fragment `#owner` appended.

An entry is also added to the `authentication` array of the DID document with type `Secp256k1SignatureAuthentication2018`.

#### Enumerating Contract Events to build the DID Document

The ERC1056 contract publishes three types of events for each identity.

-   `DIDOwnerChanged`
-   `DIDDelegateChanged`
-   `DIDAttributeChanged`

If a change has ever been made for an identity the block number is stored in the changed mapping.

The latest event can be efficiently looked up by checking for one of the 3 above events at that exact block.

Each event contains a `previousChange` value which contains the block number of the previous change (if any).

To see all changes in history for an identity use the following pseudo code:

1.  Call `changed(address identity)` on the ERC1056 contract.
2.  If result is `null` return.
3.  Filter for events for all the above types with the contracts address on the specified block.
4.  If event has a previous change then go to 3

#### Delegate Keys

Delegate keys are Ethereum addresses that can either be general signing keys or optionally also perform
authentication.

They are also verifiable from Solidity.

A `DIDDelegateChanged` event is published that is used to build a DID document.

  event DIDDelegateChanged(
    address indexed identity,
    bytes32 delegateType,
    address delegate,
    uint validTo,
    uint previousChange
    );
    

The only 2 `delegateTypes` that are currently published in the DID document are:

-   `veriKey` which adds a `Secp256k1VerificationKey2018` to the `publicKey` section of the DID document.
-   `sigAuth` which adds a `Secp256k1SignatureAuthentication2018` to the `publicKey` section of document. An entry
  is also added to the `authentication` section of the DID document.

Note, the `delegateType` is a `bytes32` type for Ethereum gas efficiency reasons and not a `string`. This 
restricts us to 32 bytes, which is why we use the short hand versions above.

Only events with a `validTo` in seconds greater or equal to the current time should be included in the DID document.

#### Non-Ethereum Attributes

Non-Ethereum keys, service endpoints etc. can be added using attributes. Attributes only exist on the 
blockchain as contract events of type `DIDAttributeChanged` and can thus not be queried from within solidity code.

  event DIDAttributeChanged(
    address indexed identity,
    bytes32 name,
    bytes value,
    uint validTo,
    uint previousChange
    );

Note, the name is a `bytes32` type for Ethereum gas efficiency reasons and not a `string`. This restricts us to 
32 bytes, which is why we use the short hand attribute versions below.

While any attribute can be stored, for the DID document we currently support adding to each of these sections of 
the DID document:

-   Public Keys
-   Service Endpoints

#### Public Keys

The name of the attribute added to ERC1056 should follow this format:

`did/pub/(Secp256k1|RSA|Ed25519)/(veriKey|sigAuth)/(hex|base64)`

##### Hex encoded Secp256k1 Verification Key

A `DIDAttributeChanged` event for the identity `0xf3beac30c498d9e26865f34fcaa57dbb935b0d74` with the name
`did/pub/Secp256k1/veriKey/hex` and the value of `0x02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71`
generates a public key entry like the following:

  {
    id: "did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74#delegate-1",
    type: "Secp256k1VerificationKey2018",
    owner: "did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74",
    publicKeyHex: '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71'
  }

##### Base64 encoded Ed25519 Verification Key

A `DIDAttributeChanged` event for the identity `0xf3beac30c498d9e26865f34fcaa57dbb935b0d74` with the name 
`did/pub/Ed25519/veriKey/base64` and the value of `0xb97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71`
generates a public key entry like this:

  {
    id: "did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74#delegate-1",
    type: "Ed25519VerificationKey2018",
    owner: "did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74",
    publicKeyBase64: "uXww3nZ/CEzjCAFo7ikwU7ozsjXXEWoyY9KfFFCTa3E="
  }

#### Service Endpoints

The name of the attribute should follow this format:

`did/svc/[ServiceName]`

A `DIDAttributeChanged` event for the identity `0xf3beac30c498d9e26865f34fcaa57dbb935b0d74` with the name 
`did/svc/HubService` and value of the URL `https://hubs.uport.me` hex encoded as 
`0x68747470733a2f2f687562732e75706f72742e6d65` generates a service endpoint entry like the following:

  {
    type: "HubService",
    serviceEndpoint: "https://hubs.uport.me"
  }

### Update

The DID Document may be updated by invoking the relevant smart contract functions as defined by the ERC1056 standard.
This includes changes to the identity owner, adding delegates and adding additional attributes. Please find a
detailed description in the [ERC1056 documentation](https://github.com/ethereum/EIPs/issues/1056).

These functions will trigger the respective Ethereum events which are used to build the DID Document for a given
identity as described in [Enumerating Contract Events to build the DID Document](#Enumerating-Contract-Events-to-build-the-DID-Document).

### Delete (Revoke)

Two cases need to be distinguished:

-   In case no changes were written to ERC1056, nothing needs to be done, and the private key which belongs to the
  Ethereum address needs to be deleted from the storage medium used to protect the keys, e.g., mobile device.
-   In case ERC1056 was utilized, the owner of the smart contract needs to be set to `0x0`. Although, `0x0`is a valid
  Ethereum address, this will indicate the identity has no owner which is a common approach for invalidation, 
  e.g., tokens. Other elements of the DID Document may be revoked explicitly by invoking the relevant smart contract
  functions as defined by the ERC1056 standard. This includes the delegates and additional attributes. Please find a
  detailed description in the [ERC1056 documentation](https://github.com/ethereum/EIPs/issues/1056). All these functions
  will trigger the respective Ethereum events which are used to build the DID Document for a given identity as
  described in [Enumerating Contract Events to build the DID Document](#Enumerating-Contract-Events-to-build-the-DID-Document). 

## Reference Implementations

The code at [https://github.com/uport-project/ethr-did-resolver](<>) is intended to present a reference implementation
of this DID method. 

## References

 **[1]** <https://w3c-ccg.github.io/did-spec/>

 **[2]** <https://github.com/ethereum/EIPs/issues/1056> 

 **[3]** <https://github.com/uport-project/ethr-did-resolver>

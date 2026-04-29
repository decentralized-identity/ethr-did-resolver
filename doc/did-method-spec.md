# ETHR DID Method Specification

## Editor

- Mircea Nistor [<ethr@mirceanis.xyz>](mailto:ethr@mirceanis.xyz)

## Preface

The ethr DID method specification conforms to the requirements specified in
the [DID specification](https://w3c-ccg.github.io/did-core/), currently published by the W3C Credentials Community
Group. For more information about DIDs and DID method specifications, please see
the [DID Primer](https://github.com/WebOfTrustInfo/rebooting-the-web-of-trust-fall2017/blob/master/topics-and-advance-readings/did-primer.md)

## Abstract

Decentralized Identifiers (DIDs, see [1]) are designed to be compatible with any distributed ledger or network. In the
Ethereum community, a pattern known as ERC1056 (see [2]) utilizes a smart contract for a lightweight identifier
management system intended explicitly for off-chain usage.

The described DID method allows any Ethereum smart contract or key pair account, or any secp256k1 public key to become
a valid identifier. Such an identifier needs no registration. In case that key management or additional attributes such
as "service endpoints" are required, they are resolved using ERC1056 smart contracts deployed on the networks listed in
the [registry repository](https://github.com/uport-project/ethr-did-registry#contract-deployments).

Since each Ethereum transaction must be funded, there is a growing trend of on-chain transactions that are authenticated
via an externally created signature and not by the actual transaction originator. This allows for 3rd party funding
services, or for receivers to pay without any fundamental changes to the underlying Ethereum architecture. These kinds
of transactions have to be signed by an actual key pair and thus cannot be used to represent smart contract based
Ethereum accounts. ERC1056 proposes a way of a smart contract or regular key pair delegating signing for various
purposes to externally managed key pairs. This allows a smart contract to be represented, both on-chain and
off-chain or in payment channels through temporary or permanent delegates.

For a reference implementation of this DID method specification see [3].

### Identifier Controller

By default, each identifier is controlled by itself, or rather by its corresponding Ethereum address. Each identifier
can only be controlled by a single Ethereum address at any given time. The controller can replace themselves with any
other Ethereum address, including contracts to allow more advanced models such as multi-signature control.

## Target System

The target system is the Ethereum network where the ERC1056 is deployed. This could either be:

- Mainnet
- Sepolia test-net
- Polygon networks
- Gnosis chain
- other EVM-compliant blockchains such as private chains, side-chains, or consortium chains.

### Advantages

- No transaction fee for identifier creation
- Identifier creation is private
- Uses Ethereum's built-in account abstraction
- Supports multi-sig (or proxy) wallet for account controller
- Supports secp256k1 public keys as identifiers (on the same infrastructure)
- Decoupling claims data from the underlying identifier
- Supports decoupling Ethereum interaction from the underlying identifier
- Flexibility to use key management
- Flexibility to allow third-party funding service to pay the gas fee if needed (meta-transactions)
- Supports any EVM-compliant blockchain
- Supports verifiable versioning

## JSON-LD Context Definition

To enable JSON-LD processing, the `@context` used when constructing DID documents for `did:ethr` depends on which
verification method types appear in the document.

The base `@context` required for all `did:ethr` documents is:

```json
{
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://w3id.org/security/suites/secp256k1recovery-2020/v2"
  ]
}
```

This covers `EcdsaSecp256k1RecoveryMethod2020` (used for the `#controller` entry and Ethereum address-based delegates)
and `blockchainAccountId` (CAIP-10 format).

Additional context entries MUST be appended when other verification method types are present in the DID document.
See the [Public Keys](#public-keys) section for the additional `@context` entries required per key type.

## DID Method Name

The namestring that shall identify this DID method is: `ethr`

A DID that uses this method MUST begin with the following prefix: `did:ethr`. Per the DID specification, this string
MUST be in lowercase. The remainder of the DID, after the prefix, is specified below.

## Method Specific Identifier

The method specific identifier is represented as the HEX-encoded secp256k1 public key (in compressed form),
or the corresponding HEX-encoded Ethereum address on the target network, prefixed with `0x`.

    ethr-did = "did:ethr:" ethr-specific-identifier
    ethr-specific-identifier = [ ethr-network ":" ] ethereum-address / public-key-hex
    ethr-network = "mainnet" / "goerli" / network-chain-id
    network-chain-id = "0x" *HEXDIG
    ethereum-address = "0x" 40*HEXDIG
    public-key-hex = "0x" 66*HEXDIG

The `ethereum-address` or `public-key-hex` are case-insensitive, however, the corresponding `blockchainAccountId`
MAY be represented using
the [mixed case checksum representation described in EIP55](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-55.md)
in the resulting DID document.

Note, if no public Ethereum network was specified, it is assumed that the DID is anchored on the Ethereum mainnet by
default. This means the following DIDs will resolve to equivalent DID Documents:

    did:ethr:mainnet:0xb9c5714089478a327f09197987f16f9e5d936e8a
    did:ethr:0x1:0xb9c5714089478a327f09197987f16f9e5d936e8a
    did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a

If the identifier is a `public-key-hex`:

- it MUST be represented in compressed form (see https://en.bitcoin.it/wiki/Secp256k1)
- the corresponding `blockchainAccountId` entry is also added to the default DID document, unless the `owner` property
  has been changed to a different address.
- all Read, Update, and Delete operations MUST be made using the corresponding `blockchainAccountId` and MUST originate
  from the correct controller account (ECR1056 `owner`).

## Relationship to ERC1056

The subject of a `did:ethr` is mapped to an `identity` Ethereum address in the ERC1056 contract. When dealing with
public key identifiers, the Ethereum address corresponding to that public key is used to represent the controller.

The controller address of a `did:ethr` is mapped to the `owner` of an `identity` in the ERC1056.
The controller address is not listed as the [DID `controller`](https://www.w3.org/TR/did-core/#did-controller) property
in the DID document. This is intentional, to simplify the verification burden required by the DID spec.
Rather, this address it is a concept specific to ERC1056 and defines the address that is allowed to perform Update and
Delete operations on the registry on behalf of the `identity` address.
This address MUST be listed with the ID `${did}#controller` in the `verificationMethod` section and also referenced
in all other verification relationships listed in the DID document.
In addition to this, if the identifier is a public key, this public key MUST be listed with the
ID `${did}#controllerKey` in all locations where `#controller` appears. The `#controllerKey` entry MUST use
type `EcdsaSecp256k1VerificationKey2019` with the `publicKeyJwk` property containing the uncompressed public key
in JWK format (`kty: "EC"`, `crv: "secp256k1"`). When resolving for `application/did+ld+json`, the DID document
`@context` MUST include `https://w3id.org/security/v2` (for the `EcdsaSecp256k1VerificationKey2019` type term) and the
inline definition `{ "publicKeyJwk": { "@id": "https://w3id.org/security#publicKeyJwk", "@type": "@json" } }` (to map
`publicKeyJwk` as a top-level term for use with this type).

## CRUD Operation Definitions

### Create (Register)

In order to create a `ethr` DID, an Ethereum address, i.e., key pair, needs to be generated. At this point, no
interaction with the target Ethereum network is required. The registration is implicit as it is impossible to brute
force an Ethereum address, i.e., guessing the private key for a given public key on the Koblitz Curve
(secp256k1). The holder of the private key is the entity identified by the DID.

The default DID document for an `did:ethr<Ethereum address>` on mainnet, e.g.
`did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74` with no transactions to the ERC1056 registry looks like this:

```json
{
  "@context": ["https://www.w3.org/ns/did/v1", "https://w3id.org/security/suites/secp256k1recovery-2020/v2"],
  "id": "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a",
  "verificationMethod": [
    {
      "id": "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a#controller",
      "type": "EcdsaSecp256k1RecoveryMethod2020",
      "controller": "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a",
      "blockchainAccountId": "eip155:1:0xb9c5714089478a327f09197987f16f9e5d936e8a"
    }
  ],
  "authentication": ["did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a#controller"],
  "assertionMethod": ["did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a#controller"]
}
```

The minimal DID Document for a `did:ethr:<public key>` where there are no corresponding TXs to the ERC1056 registry
looks like this:

```json
{
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://w3id.org/security/suites/secp256k1recovery-2020/v2",
    "https://w3id.org/security/v2",
    { "publicKeyJwk": { "@id": "https://w3id.org/security#publicKeyJwk", "@type": "@json" } }
  ],
  "id": "did:ethr:0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  "verificationMethod": [
    {
      "id": "did:ethr:0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798#controller",
      "type": "EcdsaSecp256k1RecoveryMethod2020",
      "controller": "did:ethr:0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
      "blockchainAccountId": "eip155:1:0xb9c5714089478a327f09197987f16f9e5d936e8a"
    },
    {
      "id": "did:ethr:0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798#controllerKey",
      "type": "EcdsaSecp256k1VerificationKey2019",
      "controller": "did:ethr:0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
      "publicKeyJwk": {
        "crv": "secp256k1",
        "kty": "EC",
        "x": "eb5mfvncu6xVoGKVzocLBwKb_NstzijZWfKBWxb4F5g",
        "y": "SDradyajxGVdpPv8DhEIqP0XtEimhVQZnEfQj_sQ1Lg"
      }
    }
  ],
  "authentication": [
    "did:ethr:0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798#controller",
    "did:ethr:0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798#controllerKey"
  ],
  "assertionMethod": [
    "did:ethr:0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798#controller",
    "did:ethr:0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798#controllerKey"
  ]
}
```

### Read (Resolve)

The DID document is built by using read only functions and contract events on the ERC1056 registry.

Any value from the registry that returns an Ethereum address will be added to the `verificationMethod` array of the
DID document with type [`EcdsaSecp256k1RecoveryMethod2020`](https://identity.foundation/EcdsaSecp256k1RecoverySignature2020/)
and a `blockchainAccountId` property containing the address
in [CAIP-10 Format](https://github.com/ChainAgnostic/CAIPs/blob/master/CAIPs/caip-10.md) (`eip155:<chainId>:<address>`).

Other verification relationships and service entries are added or removed by enumerating contract events (see below).

#### Controller Address

Each identifier always has a controller address. By default, it is the same as the identifier address, but the resolver
MUST check the read only contract function `identityOwner(address identity)` on the deployed ERC1056 contract.

This controller address MUST be represented in the DID document as a `verificationMethod` entry with the `id` set as the
DID being resolved and with the fragment `#controller` appended to it.
A reference to it MUST also be added to the `authentication` and `assertionMethod` arrays of the DID document.

#### Enumerating Contract Events to build the DID Document

The ERC1056 contract publishes three types of events for each identifier.

- `DIDOwnerChanged` (indicating a change of `controller`)
- `DIDDelegateChanged`
- `DIDAttributeChanged`

If a change has ever been made for the Ethereum address of an identifier the block number is stored in the
`changed` mapping of the contract.

The latest event can be efficiently looked up by checking for one of the 3 above events at that exact block.

Each ERC1056 event contains a `previousChange` value which contains the block number of the previous change (if any).

To see all changes in history for an address use the following pseudocode:

1. eth_call `changed(address identity)` on the ERC1056 contract to get the latest block where a change occurred.
2. If result is `null` return.
3. Filter for events for all the above types with the contracts address on the specified block.
4. If event has a previous change then go to 3

After building the history of events for an address, interpret each event to build the DID document like so:

##### Controller changes (`DIDOwnerChanged`)

When the controller address of a `did:ethr` is changed, a `DIDOwnerChanged` event is emitted.

```solidity
event DIDOwnerChanged(
    address indexed identity,
    address owner,
    uint previousChange
);
```

The event data MUST be used to update the `#controller` entry in the `verificationMethod` array.
When resolving DIDs with publicKey identifiers, if the controller (`owner`) address is different from the corresponding
address of the publicKey, then the `#controllerKey` entry in the `verificationMethod` array MUST be omitted.

##### Delegate Keys (`DIDDelegateChanged`)

Delegate keys are Ethereum addresses that can either be general signing keys or optionally also perform authentication.

They are also verifiable from Solidity (on-chain).

When a delegate is added or revoked, a `DIDDelegateChanged` event is published that MUST be used to update the DID
document.

```solidity
event DIDDelegateChanged(
    address indexed identity,
    bytes32 delegateType,
    address delegate,
    uint validTo,
    uint previousChange
);
```

The only 2 `delegateTypes` that are currently published in the DID document are:

- `veriKey` which adds an `EcdsaSecp256k1RecoveryMethod2020` entry to the `verificationMethod` section of the DID
  document with the `blockchainAccountId` (CAIP-10 format) of the delegate address, and adds a reference to it in the
  `assertionMethod` section.
- `sigAuth` which adds an `EcdsaSecp256k1RecoveryMethod2020` entry to the `verificationMethod` section of the document
  and adds a reference to it in the `authentication` section.

Note, the `delegateType` is a `bytes32` type for Ethereum gas efficiency reasons and not a `string`. This restricts us
to 32 bytes, which is why we use the shorthand versions above.

Only events with a `validTo` (measured in seconds) greater or equal to the current time should be included in the DID
document. When resolving an older version (using `versionId` in the didURL query string), the `validTo` entry MUST be
compared to the timestamp of the block of `versionId` height.

Such valid delegates MUST be added to the `verificationMethod` array as `EcdsaSecp256k1RecoveryMethod2020` entries, with
the `delegate` address listed in the `blockchainAccountId` property in CAIP-10 format (`eip155:<chainId>:<address>`),
according to [CAIP-10](https://standards.chainagnostic.org/CAIPs/caip-10).

Example:

```json
{
  "id": "did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74#delegate-1",
  "type": "EcdsaSecp256k1RecoveryMethod2020",
  "controller": "did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74",
  "blockchainAccountId": "eip155:1:0x12345678c498d9e26865f34fcaa57dbb935b0d74"
}
```

##### Non-Ethereum Attributes (`DIDAttributeChanged`)

Non-Ethereum keys, service endpoints etc. can be added using attributes. Attributes only exist on the blockchain as
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

Note, the name is a `bytes32` type for Ethereum gas efficiency reasons and not a `string`. This restricts us to 32
bytes, which is why we use the shorthand attribute versions explained below.

While any attribute can be stored, for the DID document we support adding to each of these sections of the DID document:

- Public Keys (Verification Methods)
- Service Endpoints

This design decision is meant to discourage the use of custom attributes in DID documents as they would be too easy to
misuse for storing personal user information forever on-chain.

###### Public Keys

The name of the attribute added to ERC1056 MUST follow this format:
`did/pub/<key algorithm>/<key purpose>/<optional encoding hint>`

Examples: `did/pub/(Secp256k1|RSA|Ed25519|X25519)/(veriKey|sigAuth|enc)/(hex|base64|base58)`

###### Key purposes

- `veriKey` adds a verification key to the `verificationMethod` section of document and adds a reference to it in
  the `assertionMethod` section of document.
- `sigAuth` adds a verification key to the `verificationMethod` section of document and adds a reference to it in
  the `authentication` section of document.
- `enc` adds a key agreement key to the `verificationMethod` section and a corresponding entry to the `keyAgreement`
  section.
  This is used to perform a Diffie-Hellman key exchange and derive a secret key for encrypting messages to the DID that
  lists such a key.

> **Note** The `<encoding>` only refers to the key encoding in the resolved DID document.
> Attribute values sent to the ERC1056 registry should always be hex encodings of the raw public key data.
> 
> The resolver MAY interpret the encoding hint and convert the verification method key material to the requested format.
> By default, resolvers SHOULD use the canonical key encoding defined by each verification method type. 

###### Known Key Types

The following table lists the supported key algorithms, their canonical verification method type, default key
encoding property, and the `@context` entries required in the DID document when that type is present.

| `<key algorithm>` | Verification Method Type            | Default Key Encoding | Required `@context` entry                                                                                                         |
|-------------------|-------------------------------------|----------------------|-----------------------------------------------------------------------------------------------------------------------------------|
| `Secp256k1`       | `EcdsaSecp256k1VerificationKey2019` | `publicKeyJwk`       | `https://w3id.org/security/v2` +<br/> `{ "publicKeyJwk": { "@id": "https://w3id.org/security#publicKeyJwk", "@type": "@json" } }` |
| `Ed25519`         | `Ed25519VerificationKey2020`        | `publicKeyMultibase` | `https://w3id.org/security/suites/ed25519-2020/v1`                                                                                |
| `X25519`          | `X25519KeyAgreementKey2020`         | `publicKeyMultibase` | `https://w3id.org/security/suites/x25519-2020/v1`                                                                                 |
| `RSA`             | `RsaVerificationKey2018`            | `publicKeyPem`       | `https://w3id.org/security/v2`                                                                                                    |

> **Note** When the resolver detects an unknown key algorithm, it MUST present it verbatim as the verification method type.
> In this case, the default key encoding is `publicKeyHex`.

###### Example Secp256k1 Verification Key

A `DIDAttributeChanged` event for the account `0xf3beac30c498d9e26865f34fcaa57dbb935b0d74` with the name
`did/pub/Secp256k1/veriKey` and the value of `0x02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71`
(a compressed SEC1 secp256k1 public key) generates a verification method entry like the following:

```json
{
  "id": "did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74#delegate-1",
  "type": "EcdsaSecp256k1VerificationKey2019",
  "controller": "did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74",
  "publicKeyJwk": {
    "kty": "EC",
    "crv": "secp256k1",
    "x": "uXww3nZ_CE7DMICBuD3ZWehwc5fNFJJDmpSfv7IpC24",
    "y": "svfFHPTcBv2Q_xbpJcIBPXHVqr3MGRGQ3epJqcKFExE"
  }
}
```

The resolver MUST convert the compressed SEC1 point from the attribute value to `publicKeyJwk` format.
The DID document `@context` MUST include `https://w3id.org/security/v2` and
`{ "publicKeyJwk": { "@id": "https://w3id.org/security#publicKeyJwk", "@type": "@json" } }` to define
`EcdsaSecp256k1VerificationKey2019` and its properties.

###### Example Hex encoded Secp256k1 Verification Key

A `DIDAttributeChanged` event for the account `0xf3beac30c498d9e26865f34fcaa57dbb935b0d74` with the name
`did/pub/Secp256k1/veriKey/hex` and the value of `0x02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71`
generates a verification method entry like the following:

```json
{
  "id": "did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74#delegate-1",
  "type": "EcdsaSecp256k1VerificationKey2019",
  "controller": "did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74",
  "publicKeyHex": "02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71"
}
```

The `@context` entry `{ "publicKeyHex": "https://w3id.org/security#publicKeyHex" }` MUST be included when this
encoding is resolved in a DID document.
The DID document `@context` MUST include `https://w3id.org/security/v2` to define `EcdsaSecp256k1VerificationKey2019`, just like in the previous example.

###### Example Ed25519 Verification Key

A `DIDAttributeChanged` event for the account `0xf3beac30c498d9e26865f34fcaa57dbb935b0d74` with the name
`did/pub/Ed25519/veriKey` and the value of `0xc642b35757cc36906fa75fa0338bf33e5210c5bce4769324801fd64276d69d07`
generates a verification method entry like this:

```json
{
  "id": "did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74#delegate-1",
  "type": "Ed25519VerificationKey2020",
  "controller": "did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74",
  "publicKeyMultibase": "z6MksoBm2hUcoKLLHsUQ77iA5YXxwNskXJ9fs7V7z8edniop"
}
```

The resolver MUST encode the raw 32-byte Ed25519 public key as `publicKeyMultibase` by prepending the multicodec
prefix `0xed01` and encoding the result as base58btc with a `z` prefix.
The DID document `@context` MUST include `https://w3id.org/security/suites/ed25519-2020/v1` to define
`Ed25519VerificationKey2020` and its scoped `publicKeyMultibase` property.

###### Example X25519 Encryption Key

A `DIDAttributeChanged` event for the account `0xf3beac30c498d9e26865f34fcaa57dbb935b0d74` with the name
`did/pub/X25519/enc` and the value of
`0x118557777ffb078774371a52b00fed75561dcf975e61c47553e664a617661052`
generates a verification method entry like this:

```json
{
  "id": "did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74#delegate-1",
  "type": "X25519KeyAgreementKey2020",
  "controller": "did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74",
  "publicKeyMultibase": "z6LScra2Lg8mSU6TkMX1AKJSn6ApwneQkfXgJZpj48hCp3N1"
}
```

The resolver MUST encode the raw 32-byte X25519 public key as `publicKeyMultibase` by prepending the multicodec
prefix `0xec01` and encoding the result as base58btc with a `z` prefix.
The DID document `@context` MUST include `https://w3id.org/security/suites/x25519-2020/v1`.

###### Example RSA Verification Key

A `DIDAttributeChanged` event for the account `0xf3beac30c498d9e26865f34fcaa57dbb935b0d74` with the name
`did/pub/RSA/veriKey` and the value being the DER-encoded RSA public key bytes (hex-encoded on-chain) generates
a verification method entry like this:

```json
{
  "id": "did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74#delegate-1",
  "type": "RsaVerificationKey2018",
  "controller": "did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74",
  "publicKeyPem": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2a2rwplBQLF29amygykE\nMmYz0...L/S1yd9zICAWMsTQMtogkBdJ\nnwIDAQAB\n-----END PUBLIC KEY-----"
}
```

The resolver MUST convert the hex attribute value to bytes and then PEM-encode them as a
[PKCS#8](https://www.rfc-editor.org/rfc/rfc5958) `PUBLIC KEY` block. The attribute value is expected to already
be a DER-encoded PKCS#8 `SubjectPublicKeyInfo` structure; the resolver base64-encodes those bytes and wraps them
with `-----BEGIN PUBLIC KEY-----` / `-----END PUBLIC KEY-----` headers to produce the PEM string.
The DID document `@context` MUST include `https://w3id.org/security/v2` to define `RsaVerificationKey2018` and `publicKeyPem`.

###### Service Endpoints

The name of the attribute should follow this format:

`did/svc/[ServiceName]`

Example:

A `DIDAttributeChanged` event for the account `0xf3beac30c498d9e26865f34fcaa57dbb935b0d74` with the name
`did/svc/HubService` and value of the URL `https://hubs.uport.me` hex encoded as
`0x68747470733a2f2f687562732e75706f72742e6d65` generates a service endpoint entry like the following:

```json
{
  "id": "did:ethr:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74#service-1",
  "type": "HubService",
  "serviceEndpoint": "https://hubs.uport.me"
}
```

#### `id` properties of entries

With the exception of `#controller` and `#controllerKey`, the `id` properties that appear throughout the DID document
MUST be stable across updates. This means that the same key material will be referenced by the same ID after an update
or automatic expiry of the other attributes.

- Attribute or delegate changes that result in `verificationMethod` entries MUST set the `id`
  `${did}#delegate-${eventIndex}`.
- Attributes that result in `service` entries MUST set the `id` to `${did}#service-${eventIndex}`

where `eventIndex` is the index of the event that modifies that section of the DID document.

**Example**

- add key => `#delegate-1` is added
- add another key => `#delegate-2` is added
- add delegate => `#delegate-3` is added
- add service => `#service-1` is added
- revoke first key => `#delegate-1` gets removed from the DID document; `#delegate-2` and `#delegate-3` remain.
- add another delegate => `#delegate-5` is added (earlier revocation is counted as an event)
- first delegate expires => `#delegate-3` is removed, `#delegate-5` remains intact

### Update

The DID Document may be updated by invoking the relevant smart contract functions as defined by the ERC1056 standard.
This includes changes to the account owner, adding delegates and adding additional attributes. Please find a detailed
description in the [ERC1056 documentation](https://github.com/ethereum/EIPs/issues/1056).

These functions will trigger the respective Ethereum events which are used to build the DID Document for a given
account as described
in [Enumerating Contract Events to build the DID Document](#Enumerating-Contract-Events-to-build-the-DID-Document).

Some elements of the DID Document will be revoked automatically when their validity period expires. This includes the
delegates and additional attributes. Please find a detailed description in the
[ERC1056 documentation](https://github.com/ethereum/EIPs/issues/1056). All attribute and delegate functions will trigger
the respective Ethereum events which are used to build the DID Document for a given identifier as described
in [Enumerating Contract Events to build the DID Document](#Enumerating-Contract-Events-to-build-the-DID-Document).

### Delete (Revoke)

The `owner` property of the identifier MUST be set to `0x0`. Although, `0x0` is a valid Ethereum address, this will
indicate the account has no owner which is a common approach for invalidation, e.g., tokens. To detect if the `owner` is
the `null` address, one MUST get the logs of the last change to the account and inspect if the `owner` was set to the
null address (`0x0000000000000000000000000000000000000000`). It is impossible to make any other changes to the DID
document after such a change, therefore all preexisting keys and services MUST be considered revoked.

If the intention is to revoke all the signatures corresponding to the DID, this option MUST be used.

The DID resolution result for a deactivated DID has the following shape:

```json
{
  "didDocumentMetadata": {
    "deactivated": true
  },
  "didResolutionMetadata": {
    "contentType": "application/did+ld+json"
  },
  "didDocument": {
    "@context": "https://www.w3.org/ns/did/v1",
    "id": "<the deactivated DID>",
    "verificationMethod": [],
    "assertionMethod": [],
    "authentication": []
  }
}
```

## Metadata

The `resolve` method returns an object with the following properties: `didDocument`, `didDocumentMetadata`,
`didResolutionMetadata`.

### DID Document Metadata

When resolving a DID document that has had updates, the latest update MUST be listed in the `didDocumentMetadata`.

- `versionId` MUST be the block number of the latest update.
- `updated` MUST be the ISO date string of the block time of the latest update (without sub-second resolution).

Example:

```json
{
  "didDocumentMetadata": {
    "versionId": "12090175",
    "updated": "2021-03-22T18:14:29Z"
  }
}
```

### DID Resolution Metadata

```json
{
  "didResolutionMetadata": {
    "contentType": "application/did+ld+json"
  }
}
```

## Resolving DID URIs with query parameters.

### `versionId` query string parameter

This DID method supports resolving previous versions of the DID document by specifying a `versionId` parameter.

Example: `did:ethr:0x26bf14321004e770e7a8b080b7a526d8eed8b388?versionId=12090175`

The `versionId` is the block number at which the DID resolution MUST be performed.
Only ERC1056 events prior to or contained in this block number are to be considered when building the event history.

If there are any events after that block that mutate the DID, the earliest of them SHOULD be used to populate the
properties of the `didDocumentMetadata`:

- `nextVersionId` MUST be the block number of the next update to the DID document.
- `nextUpdate` MUST be the ISO date string of the block time of the next update (without sub-second resolution).

In case the DID has had updates prior to or included in the `versionId` block number, the `updated` and `versionId`
properties of the `didDocumentMetadata` MUST correspond to the latest block prior to the `versionId` query string param.

Any timestamp comparisons of `validTo` fields of the event history MUST be done against the `versionId` block timestamp.

Example:
`?versionId=12101682`

```json
{
  "didDocumentMetadata": {
    "versionId": "12090175",
    "updated": "2021-03-22T18:14:29Z",
    "nextVersionId": "12276565",
    "nextUpdate": "2021-04-20T10:48:42Z"
  }
}
```

## Security Considerations

as required by the [W3C DID specification](https://www.w3.org/TR/did-core/#security-requirements), guided
by [RFC3552](https://www.rfc-editor.org/rfc/rfc3552) as they apply to the `did:ethr` method and ERC1056-based
operations.

### Eavesdropping

DID resolution for `did:ethr` relies on JSON-RPC calls to Ethereum nodes to read contract state and event logs. These
calls can expose which identifiers are being resolved and what data is returned. Implementers MUST use TLS-secured
(HTTPS/WSS) connections to Ethereum RPC endpoints. Even with transport encryption, the RPC provider itself can observe
all resolution queries. For high-assurance scenarios, running a local full node is RECOMMENDED.

### Replay Attacks

On-chain ERC1056 transactions inherit Ethereum's native replay protection through account nonces and EIP-155 chain IDs.
The ERC1056 proposal mentions meta-transaction support, where a user can sign a transaction off-chain and have a third
party submit it on their behalf. If this pattern is used by a user and the ERC1056 registry implementation does not require
chain-specific signatures, then the same signed meta-transaction could be replayed on a different Ethereum network (e.g.,
mainnet vs. a testnet), potentially causing unintended updates to the corresponding DID on that different network.
To mitigate this, users can opt to not use the meta-transaction support in the ERC-1056 implementation or change the
owner
of their DID to a smart contract that implements its own meta-transaction support, bypassing the ERC-1056 implementation
altogether.

### Message Insertion and Modification

The integrity of DID document data depends on trust in the Ethereum RPC endpoint used for resolution. A compromised or
malicious RPC provider could return fabricated event logs or omit legitimate events, resulting in an incorrect DID
document. Full node verification provides the strongest integrity guarantees since all state transitions are validated
locally. Light clients (e.g., those relying on block header proofs) offer weaker guarantees and trust the honesty of the
peers serving the data. Implementers SHOULD cross-reference results from multiple independent RPC providers when full
node verification is not feasible.

### Deletion

ERC1056 contract events are immutable once confirmed on-chain; they cannot be deleted from the blockchain history.
Attributes and delegates are effectively removed from the DID document by their validity period expiring or by an
explicit revocation event. DID deactivation is achieved by calling `changeOwner` with the null address
(`0x0000000000000000000000000000000000000000`), which is irreversible. After deactivation, no further changes to the DID
document are possible, and all pre-existing keys and services MUST be considered revoked.

### Denial of Service

An attacker with sufficient funds can add a large number of attributes and delegates to an identity on ERC1056,
inflating
the event history that resolvers must enumerate. Since resolution requires scanning all historical events for a given
identity, excessively long histories increase resolution time and resource consumption. Resolvers SHOULD implement
caching strategies and set reasonable limits on event enumeration depth. Additionally, the availability of the Ethereum
RPC endpoint is a dependency for resolution; if the endpoint is unavailable, resolution will fail. Deployments SHOULD
use redundant RPC providers or local nodes to mitigate this.

### Amplification

A single `setAttribute` or `addDelegate` call on ERC1056 produces an event that the resolver must process and
potentially expand into one or more DID document entries (verification methods, services). An attacker could issue many
such calls to force resolvers to process disproportionately large amounts of data relative to the on-chain input.
Resolvers MAY impose upper bounds on the number of events processed for a single identity and alert or fail when
those bounds are exceeded.

### Man-in-the-Middle

The primary man-in-the-middle vector is a compromised Ethereum RPC provider returning manipulated contract state or
event logs during resolution. This could lead a verifier to trust a forged DID document. Mitigations include:
using trusted, authenticated RPC endpoints; cross-referencing results from multiple independent providers; and running a
local full node for authoritative state. On-chain operations themselves (Create, Update, Delete) are protected by
ECDSA signature verification in the ERC1056 contract and are not susceptible to man-in-the-middle attacks.

### Integrity Protection and Update Authentication

All state changes in ERC1056 require authorization from the current controller (`owner`) of the identity. Direct
transactions must originate from the `owner` address, and the Ethereum protocol verifies the transaction signature.
Meta-transactions (where a third party submits the transaction) require an off-chain ECDSA signature from the `owner`,
which is verified on-chain by the ERC1056 contract before the state change is applied. This ensures that only the
legitimate controller can modify the DID document, regardless of who pays the gas fee. The `owner` address is the sole
authority for all update and deactivation operations.

### Unique Assignment

The uniqueness of `did:ethr` identifiers is guaranteed by the properties of the secp256k1 elliptic curve used by
Ethereum. Generating a key pair produces a public key from which the Ethereum address is derived via Keccak-256 hashing.
The probability of two independently generated key pairs producing the same address is negligible (approximately
2^-160). No on-chain registration is required for identifier creation, which eliminates the risk of registration-time
conflicts. When using public key identifiers (66-hex-character form), uniqueness is similarly guaranteed by the
cryptographic properties of the curve (~2^-256 collision resistance for full public keys).

### Endpoint Authentication and Network Topology

Resolvers depend on Ethereum RPC endpoints to retrieve contract state and events. The security of resolution is
therefore bounded by the trust placed in these endpoints. Hosted RPC providers (e.g., Infura, Alchemy) offer convenience
but require trusting the provider not to censor or fabricate responses. Self-hosted full nodes provide the highest
assurance by independently validating all state transitions.

Light client implementations, which verify only block headers and Merkle proofs rather than re-executing all
transactions, offer a middle ground but rely on the honesty of peers serving block data. Where `did:ethr` is deployed on
networks with varying topology (e.g., side-chains, L2 rollups), the specific security assumptions of that network's
consensus and data availability model MUST be documented and understood by relying-parties.

### Cryptographic Protection

All on-chain authentication in ERC1056 uses secp256k1 ECDSA signatures. Transaction signatures protect the integrity
and authenticity of all state-changing operations. The `ecrecover` precompile is used for meta-transaction signature
verification, recovering the signer's address from the signature and comparing it to the identity's `owner`.

Public keys listed in the DID document are not encrypted; they are intended to be public. The DID document itself does
not provide confidentiality. Integrity of the DID document is derived from the integrity of the underlying blockchain
state. The secp256k1 curve provides approximately 128 bits of security against known attacks.

### Key Management and Secret Data

Private keys that control `did:ethr` identifiers (i.e., the key corresponding to the `owner` address) MUST be stored
securely and MUST NOT be exposed in DID documents, on-chain data, or resolver outputs. Similarly, private keys for any
delegates MUST be protected by their holders.

Key rotation is supported via the `changeOwner` function, which transfers control to a new Ethereum address. Users
SHOULD rotate keys periodically and SHOULD revoke compromised keys immediately by calling `changeOwner` to transfer
control to a secure address. There is no built-in social recovery or multi-party recovery mechanism in ERC1056; however,
the `owner` can be set to a smart contract address (e.g., a multi-sig wallet) to enable more advanced recovery and
access control schemes.

### Peer-to-Peer Resource Considerations

Resolution of `did:ethr` identifiers requires enumerating contract events from the Ethereum blockchain. The cost of
resolution scales linearly with the number of historical changes made to an identity. For identities with extensive
histories, this can result in significant RPC call overhead and processing time.

On-chain operations (adding attributes, delegates, or changing the owner) incur gas costs, which serve as a natural
rate-limiting mechanism against spam. However, on networks with low gas costs, this protection is weaker. Resolvers
SHOULD implement caching and pagination strategies to manage resource consumption. Service operators SHOULD monitor for
identities with abnormally large event histories as a potential indicator of abuse.

### DID Document Versioning

Applications MUST take precautions when using versioned DID URIs (resolved with the `versionId` query parameter). If a
key is compromised and subsequently revoked, it can still be used to produce valid signatures when verified against an
older version of the DID document. The use of versioned DID URIs is only RECOMMENDED in limited situations where:

- The timestamp of signatures can be independently verified.
- Malicious signatures can be revoked through an external mechanism.
- Applications can check for explicit revocations of either keys or signatures.

Wherever versioned DIDs are in use, it SHOULD be made obvious to users that they are dealing with historical data that
may reference revoked keys or outdated service endpoints.

### Residual Risks

Even with the above mitigations, the following residual risks remain:

- **Smart contract vulnerabilities**: Bugs in the ERC1056 registry contract could allow unauthorized state changes.
  The reference contract has been widely deployed and used, but has not been formally verified.
- **Chain reorganizations**: Recent events may be affected by blockchain reorganizations, temporarily altering the
  resolved DID document. Resolvers SHOULD wait for sufficient block confirmations before treating state as final.
- **Cryptographic advances**: Future advances in computing (e.g., quantum computing) may weaken secp256k1 ECDSA. The
  `did:ethr` method currently has no migration path to post-quantum algorithms, though the `changeOwner` mechanism
  could potentially be used to transition control to a quantum-resistant smart contract.

## Privacy Considerations

as required by [the DID specification](https://w3c.github.io/did/#privacy-requirements), guided
by [RFC 6973](https://datatracker.ietf.org/doc/html/rfc6973#section-5).

### Surveillance

All ERC1056 contract events (`DIDOwnerChanged`, `DIDDelegateChanged`, `DIDAttributeChanged`) are publicly recorded on
the Ethereum blockchain. Any observer can monitor DID document changes, key rotations, and delegate additions for any
`did:ethr` identifier. This is an inherent property of using a public ledger as the verifiable data registry. However,
the DID document itself does not mandate personally identifiable information (PII) -- it should only hold cryptographic
key material and service endpoints. Implementers should be aware that transaction metadata (sender address, gas payer,
timestamps) is also publicly observable and could be used for surveillance purposes.

### Stored Data Compromise

Since the ERC1056 registry is a public smart contract on a public blockchain, the data it holds is already publicly
accessible. There is no traditional "stored data compromise" risk for the on-chain data itself. The primary risk is
compromise of the private key controlling the DID. If the controller's private key is compromised, an attacker can make
unauthorized changes to the DID document via the ERC1056 contract. The `changeOwner` function can be used to rotate the
controller to a new key pair.

### Unsolicited Traffic

Service endpoints published in DID documents (via `DIDAttributeChanged` events with `did/svc/` attributes) could expose
the DID subject to unsolicited traffic. Implementers should exercise caution when adding service endpoints to DID
documents, and should consider the implications of making such endpoints publicly discoverable. Where possible, service
endpoints should implement their own authentication and authorization mechanisms.

### Misattribution

If the controller key of a `did:ethr` is compromised, an attacker could modify the DID document to add verification
methods under their control, enabling them to create signatures misattributed to the DID subject. The risk is mitigated
by the ability to rotate the controller key via `changeOwner`. Users should monitor their DID documents for unauthorized
changes by watching ERC1056 events for their identity address.

### Correlation

Ethereum addresses and public keys used as `did:ethr` identifiers are inherently correlatable on public blockchains. All
transactions and state changes associated with an address are publicly visible, making it possible for observers to
correlate activity across different contexts where the same DID is used. To minimize correlation, users should create
separate DIDs for different relationships or contexts. Since `did:ethr` creation requires no on-chain transaction and
incurs no cost, maintaining multiple DIDs is practical. Meta-transaction support further helps by decoupling the gas
payer from the DID controller, reducing the ability to correlate based on funding sources.

### Identification

A `did:ethr` identifier does not inherently reveal the real-world identity of its subject. However, if the underlying
Ethereum address has been linked to a real-world identity through external means (e.g., KYC processes on exchanges,
public ENS registrations, or disclosed transactions), the DID can become linked to that identity. The method itself does
not require or encourage the disclosure of PII. Implementers and users should be aware that the public nature of the
Ethereum blockchain means any prior or future association between an address and a real-world identity will compromise
pseudonymity.

### Secondary Use

Data published to the ERC1056 registry is immutable and publicly available. Any attributes, delegates, or service
endpoints written on-chain may be used by third parties for purposes beyond the DID subject's original intent. Since the
blockchain is append-only, even revoked attributes remain visible in the historical event log (though they are excluded
from the resolved DID document). Implementers should minimize the data stored on-chain and should avoid publishing
sensitive information as DID document attributes. The design of ERC1056 intentionally limits attribute types to
verification methods and service endpoints to discourage misuse for storing personal data on-chain.

### Disclosure

DID documents resolved from the ERC1056 registry are fully public. There is no mechanism for selective disclosure at the
DID document level -- all verification methods and service endpoints are visible to any resolver. Sensitive claims or
attributes about the DID subject should not be stored in the DID document. Instead, implementers should use Verifiable
Credentials or other privacy-preserving mechanisms for sharing identity attributes, using the DID only as the identifier
and the DID document only for cryptographic key discovery and service endpoint resolution.

### Exclusion

The `did:ethr` method upholds the principle of exclusion by ensuring the DID subject (via their controller key) has full
authority over their DID document. The controller can add or revoke delegates, update attributes, rotate the controller
key, and deactivate the DID entirely by setting the owner to `0x0`. No third party can make changes to the DID document
without control of the controller key (or a meta-transaction signed by it). This ensures that the DID subject is not
excluded from decisions about the use and management of their identifier.

## Reference Implementations

The code at [https://github.com/decentralized-identity/ethr-did-resolver]() is intended to present a reference
implementation of this DID method.

## References

**[1]** <https://w3c-ccg.github.io/did-core/>

**[2]** <https://github.com/ethereum/EIPs/issues/1056>

**[3]** <https://github.com/decentralized-identity/ethr-did-resolver>

**[4]** <https://github.com/uport-project/ethr-did-registry>

/* SPDX-License-Identifier: MIT */

pragma solidity ^0.8.24;

/// @title EthereumDIDRegistry
/// @author Pelle Braendgaard (uPort)
/// @notice ERC-1056 identity registry anchoring did:ethr DIDs. An identity is
///   any Ethereum address; identities can be explicitly owned, can delegate
///   signing rights for a validity period, and can carry attributes that are
///   interpreted off-chain (in the did:ethr resolver).
contract EthereumDIDRegistry {
  /// @notice Explicit owner of each identity (address(0) means the identity owns itself)
  mapping(address => address) public owners;
  /// @notice Delegate validity: identity => keccak256(delegateType) => delegate => unix timestamp until valid
  mapping(address => mapping(bytes32 => mapping(address => uint256))) public delegates;
  /// @notice Block number of the last change to each identity
  mapping(address => uint256) public changed;
  /// @notice Meta-transaction nonce per signer, for replay protection
  mapping(address => uint256) public nonce;

  /// @notice Restricts the wrapped function to the current owner of `identity`
  /// @param identity The identity whose owner must match `actor`
  /// @param actor The address attempting the operation
  modifier onlyOwner(address identity, address actor) {
    require(actor == identityOwner(identity), "bad_actor");
    _;
  }

  /// @notice Emitted when an identity's owner changes
  /// @param identity The identity whose owner changed
  /// @param owner The new owner
  /// @param previousChange Block number of the previous change to this identity
  event DIDOwnerChanged(address indexed identity, address owner, uint256 previousChange);

  /// @notice Emitted when a delegate is added to or revoked from an identity
  /// @param identity The identity the delegate belongs to
  /// @param delegateType The delegate type (e.g. "sigAuth" or "veriKey")
  /// @param delegate The delegate address
  /// @param validTo Unix timestamp when the delegation ends (revocation uses the current time)
  /// @param previousChange Block number of the previous change to this identity
  event DIDDelegateChanged(
    address indexed identity,
    bytes32 delegateType,
    address delegate,
    uint256 validTo,
    uint256 previousChange
  );

  /// @notice Emitted when an attribute is set or revoked for an identity
  /// @param identity The identity the attribute belongs to
  /// @param name The attribute name
  /// @param value The attribute value
  /// @param validTo Unix timestamp when the attribute expires (0 for revocation)
  /// @param previousChange Block number of the previous change to this identity
  event DIDAttributeChanged(
    address indexed identity,
    bytes32 name,
    bytes value,
    uint256 validTo,
    uint256 previousChange
  );

  /// @notice Returns the owner of an identity, or the identity itself if it has no explicit owner
  /// @param identity The identity to look up
  /// @return The owner address (the identity itself when unowned)
  function identityOwner(address identity) public view returns (address) {
    address owner = owners[identity];
    if (owner != address(0x00)) {
      return owner;
    }
    return identity;
  }

  /// @notice Recovers the signer of a meta-transaction hash and requires it to be the identity owner
  /// @param identity The identity the meta-transaction targets
  /// @param sigV ECDSA recovery id
  /// @param sigR ECDSA signature R component
  /// @param sigS ECDSA signature S component
  /// @param hash The signed hash
  /// @return The recovered signer address
  function checkSignature(
    address identity,
    uint8 sigV,
    bytes32 sigR,
    bytes32 sigS,
    bytes32 hash
  ) internal returns (address) {
    address signer = ecrecover(hash, sigV, sigR, sigS);
    require(signer == identityOwner(identity), "bad_signature");
    ++nonce[signer];
    return signer;
  }

  /// @notice Checks whether a delegate is currently valid for an identity and delegate type
  /// @param identity The identity to check
  /// @param delegateType The delegate type
  /// @param delegate The delegate address
  /// @return True if the delegation has not expired
  function validDelegate(address identity, bytes32 delegateType, address delegate) public view returns (bool) {
    uint256 validity = delegates[identity][keccak256(abi.encode(delegateType))][delegate];
    return (validity > block.timestamp);
  }

  /// @notice Sets a new owner for an identity (internal)
  /// @param identity The identity whose owner changes
  /// @param actor The caller, must be the current owner
  /// @param newOwner The new owner
  function changeOwner(address identity, address actor, address newOwner) internal onlyOwner(identity, actor) {
    owners[identity] = newOwner;
    emit DIDOwnerChanged(identity, newOwner, changed[identity]);
    changed[identity] = block.number;
  }

  /// @notice Sets a new owner for an identity, called by the current owner
  /// @param identity The identity whose owner changes
  /// @param newOwner The new owner
  function changeOwner(address identity, address newOwner) public {
    changeOwner(identity, msg.sender, newOwner);
  }

  /// @notice Sets a new owner for an identity via a signed meta-transaction
  /// @param identity The identity whose owner changes
  /// @param sigV ECDSA recovery id of the owner's signature
  /// @param sigR ECDSA signature R component
  /// @param sigS ECDSA signature S component
  /// @param newOwner The new owner
  function changeOwnerSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, address newOwner) public {
    bytes32 hash = keccak256(
      abi.encodePacked(bytes1(0x19), bytes1(0), this, nonce[identityOwner(identity)], identity, "changeOwner", newOwner)
    );
    changeOwner(identity, checkSignature(identity, sigV, sigR, sigS, hash), newOwner);
  }

  /// @notice Adds a delegate for an identity (internal)
  /// @param identity The identity the delegate is added to
  /// @param actor The caller, must be the current owner
  /// @param delegateType The delegate type (e.g. "sigAuth" or "veriKey")
  /// @param delegate The delegate address
  /// @param validity Delegation length in seconds from now
  function addDelegate(
    address identity,
    address actor,
    bytes32 delegateType,
    address delegate,
    uint256 validity
  ) internal onlyOwner(identity, actor) {
    delegates[identity][keccak256(abi.encode(delegateType))][delegate] = block.timestamp + validity;
    emit DIDDelegateChanged(identity, delegateType, delegate, block.timestamp + validity, changed[identity]);
    changed[identity] = block.number;
  }

  /// @notice Adds a delegate for an identity, called by the current owner
  /// @param identity The identity the delegate is added to
  /// @param delegateType The delegate type (e.g. "sigAuth" or "veriKey")
  /// @param delegate The delegate address
  /// @param validity Delegation length in seconds from now
  function addDelegate(address identity, bytes32 delegateType, address delegate, uint256 validity) public {
    addDelegate(identity, msg.sender, delegateType, delegate, validity);
  }

  /// @notice Adds a delegate for an identity via a signed meta-transaction
  /// @param identity The identity the delegate is added to
  /// @param sigV ECDSA recovery id of the owner's signature
  /// @param sigR ECDSA signature R component
  /// @param sigS ECDSA signature S component
  /// @param delegateType The delegate type (e.g. "sigAuth" or "veriKey")
  /// @param delegate The delegate address
  /// @param validity Delegation length in seconds from now
  function addDelegateSigned(
    address identity,
    uint8 sigV,
    bytes32 sigR,
    bytes32 sigS,
    bytes32 delegateType,
    address delegate,
    uint256 validity
  ) public {
    bytes32 hash = keccak256(
      abi.encodePacked(
        bytes1(0x19),
        bytes1(0),
        this,
        nonce[identityOwner(identity)],
        identity,
        "addDelegate",
        delegateType,
        delegate,
        validity
      )
    );
    addDelegate(identity, checkSignature(identity, sigV, sigR, sigS, hash), delegateType, delegate, validity);
  }

  /// @notice Revokes a delegate for an identity (internal)
  /// @param identity The identity the delegate is revoked from
  /// @param actor The caller, must be the current owner
  /// @param delegateType The delegate type (e.g. "sigAuth" or "veriKey")
  /// @param delegate The delegate address
  function revokeDelegate(
    address identity,
    address actor,
    bytes32 delegateType,
    address delegate
  ) internal onlyOwner(identity, actor) {
    delegates[identity][keccak256(abi.encode(delegateType))][delegate] = block.timestamp;
    emit DIDDelegateChanged(identity, delegateType, delegate, block.timestamp, changed[identity]);
    changed[identity] = block.number;
  }

  /// @notice Revokes a delegate for an identity, called by the current owner
  /// @param identity The identity the delegate is revoked from
  /// @param delegateType The delegate type (e.g. "sigAuth" or "veriKey")
  /// @param delegate The delegate address
  function revokeDelegate(address identity, bytes32 delegateType, address delegate) public {
    revokeDelegate(identity, msg.sender, delegateType, delegate);
  }

  /// @notice Revokes a delegate for an identity via a signed meta-transaction
  /// @param identity The identity the delegate is revoked from
  /// @param sigV ECDSA recovery id of the owner's signature
  /// @param sigR ECDSA signature R component
  /// @param sigS ECDSA signature S component
  /// @param delegateType The delegate type (e.g. "sigAuth" or "veriKey")
  /// @param delegate The delegate address
  function revokeDelegateSigned(
    address identity,
    uint8 sigV,
    bytes32 sigR,
    bytes32 sigS,
    bytes32 delegateType,
    address delegate
  ) public {
    bytes32 hash = keccak256(
      abi.encodePacked(
        bytes1(0x19),
        bytes1(0),
        this,
        nonce[identityOwner(identity)],
        identity,
        "revokeDelegate",
        delegateType,
        delegate
      )
    );
    revokeDelegate(identity, checkSignature(identity, sigV, sigR, sigS, hash), delegateType, delegate);
  }

  /// @notice Sets an attribute on an identity (internal)
  /// @param identity The identity the attribute is set on
  /// @param actor The caller, must be the current owner
  /// @param name The attribute name
  /// @param value The attribute value
  /// @param validity Attribute length in seconds from now
  function setAttribute(
    address identity,
    address actor,
    bytes32 name,
    bytes memory value,
    uint256 validity
  ) internal onlyOwner(identity, actor) {
    emit DIDAttributeChanged(identity, name, value, block.timestamp + validity, changed[identity]);
    changed[identity] = block.number;
  }

  /// @notice Sets an attribute on an identity, called by the current owner
  /// @param identity The identity the attribute is set on
  /// @param name The attribute name
  /// @param value The attribute value
  /// @param validity Attribute length in seconds from now
  function setAttribute(address identity, bytes32 name, bytes memory value, uint256 validity) public {
    setAttribute(identity, msg.sender, name, value, validity);
  }

  /// @notice Sets an attribute on an identity via a signed meta-transaction
  /// @param identity The identity the attribute is set on
  /// @param sigV ECDSA recovery id of the owner's signature
  /// @param sigR ECDSA signature R component
  /// @param sigS ECDSA signature S component
  /// @param name The attribute name
  /// @param value The attribute value
  /// @param validity Attribute length in seconds from now
  function setAttributeSigned(
    address identity,
    uint8 sigV,
    bytes32 sigR,
    bytes32 sigS,
    bytes32 name,
    bytes memory value,
    uint256 validity
  ) public {
    bytes32 hash = keccak256(
      abi.encodePacked(
        bytes1(0x19),
        bytes1(0),
        this,
        nonce[identityOwner(identity)],
        identity,
        "setAttribute",
        name,
        value,
        validity
      )
    );
    setAttribute(identity, checkSignature(identity, sigV, sigR, sigS, hash), name, value, validity);
  }

  /// @notice Revokes an attribute on an identity (internal)
  /// @param identity The identity the attribute is revoked from
  /// @param actor The caller, must be the current owner
  /// @param name The attribute name
  /// @param value The attribute value
  function revokeAttribute(
    address identity,
    address actor,
    bytes32 name,
    bytes memory value
  ) internal onlyOwner(identity, actor) {
    emit DIDAttributeChanged(identity, name, value, 0, changed[identity]);
    changed[identity] = block.number;
  }

  /// @notice Revokes an attribute on an identity, called by the current owner
  /// @param identity The identity the attribute is revoked from
  /// @param name The attribute name
  /// @param value The attribute value
  function revokeAttribute(address identity, bytes32 name, bytes memory value) public {
    revokeAttribute(identity, msg.sender, name, value);
  }

  /// @notice Revokes an attribute on an identity via a signed meta-transaction
  /// @param identity The identity the attribute is revoked from
  /// @param sigV ECDSA recovery id of the owner's signature
  /// @param sigR ECDSA signature R component
  /// @param sigS ECDSA signature S component
  /// @param name The attribute name
  /// @param value The attribute value
  function revokeAttributeSigned(
    address identity,
    uint8 sigV,
    bytes32 sigR,
    bytes32 sigS,
    bytes32 name,
    bytes memory value
  ) public {
    bytes32 hash = keccak256(
      abi.encodePacked(
        bytes1(0x19),
        bytes1(0),
        this,
        nonce[identityOwner(identity)],
        identity,
        "revokeAttribute",
        name,
        value
      )
    );
    revokeAttribute(identity, checkSignature(identity, sigV, sigR, sigS, hash), name, value);
  }
}

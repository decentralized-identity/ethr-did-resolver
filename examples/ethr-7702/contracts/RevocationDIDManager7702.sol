// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

interface IEthereumDIDRegistry {
    function setAttribute(
        address identity,
        bytes32 name,
        bytes calldata value,
        uint256 validity
    ) external;

    function revokeAttribute(
        address identity,
        bytes32 name,
        bytes calldata value
    ) external;
}

/// @title RevocationDIDManager7702
/// @notice EIP-7702 delegation contract that combines DID attribute management with
///         an on-chain revocation registry stored directly on the EOA.
///
///         Two revocation mechanisms are provided:
///
///         1. **ERC-1056 attribute revocation** (`revokeAttributeForIdentity`):
///            Calls `IEthereumDIDRegistry.revokeAttribute`, which emits a
///            `DIDAttributeChanged` event with `validTo = 0`, signalling to
///            resolvers that the attribute is no longer valid.
///
///         2. **Credential-level revocation** (`revokeCredential`):
///            Stores a revocation record keyed by a `credentialId` (e.g. the
///            hash of a Verifiable Credential) in the EOA's own storage. Verifiers
///            can call `isRevoked(eoaAddress, credentialId)` on-chain, or index
///            `CredentialRevoked` events off-chain, to check credential status.
///
///         Storage layout (on the delegating EOA):
///           slot 0 — revocations  (mapping(bytes32 => bool))
///
/// @dev    Only the EOA owner (address(this)) may call revocation functions.
contract RevocationDIDManager7702 {
    // -----------------------------------------------------------------------
    // Storage
    // -----------------------------------------------------------------------

    /// @dev credentialId → revoked
    mapping(bytes32 => bool) public revocations;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event CredentialRevoked(bytes32 indexed credentialId, uint256 revokedAt);

    // -----------------------------------------------------------------------
    // DID attribute management (mirrors DIDManager7702)
    // -----------------------------------------------------------------------

    /// @notice Sets a DID attribute for this identity. Only callable by the EOA owner.
    function setAttributeForIdentity(
        address registry,
        bytes32 name,
        bytes calldata value,
        uint256 validity
    ) external {
        require(msg.sender == address(this), "only owner");
        IEthereumDIDRegistry(registry).setAttribute(address(this), name, value, validity);
    }

    // -----------------------------------------------------------------------
    // ERC-1056 attribute revocation
    // -----------------------------------------------------------------------

    /// @notice Revokes a DID attribute via the ERC-1056 registry.
    ///         Sets validTo = 0 in the registry, which resolvers interpret as expired.
    ///         Only callable by the EOA owner.
    function revokeAttributeForIdentity(
        address registry,
        bytes32 name,
        bytes calldata value
    ) external {
        require(msg.sender == address(this), "only owner");
        IEthereumDIDRegistry(registry).revokeAttribute(address(this), name, value);
    }

    // -----------------------------------------------------------------------
    // Credential-level revocation registry
    // -----------------------------------------------------------------------

    /// @notice Marks a credential as revoked. Only callable by the EOA owner.
    /// @param credentialId  Arbitrary identifier — e.g. keccak256(abi.encode(vcId)).
    function revokeCredential(bytes32 credentialId) external {
        require(msg.sender == address(this), "only owner");
        revocations[credentialId] = true;
        emit CredentialRevoked(credentialId, block.timestamp);
    }

    /// @notice Returns true if the credential has been revoked by this identity.
    /// @dev    Callable on the EOA's address after delegation is set.
    function isRevoked(bytes32 credentialId) external view returns (bool) {
        return revocations[credentialId];
    }
}

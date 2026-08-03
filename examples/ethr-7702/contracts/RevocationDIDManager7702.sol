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
///           Namespaced storage at slot keccak256("ethr-7702.RevocationDIDManager7702"):
///             base + 0 — revocations  (mapping(bytes32 => bool))
///
///         The slot is a per-manager namespace derived from the contract name, so
///         re-delegating a single EOA between different managers can never collide
///         with their state.
///
/// @dev    Only the EOA owner (address(this)) may call revocation functions.
contract RevocationDIDManager7702 {
    // -----------------------------------------------------------------------
    // Namespaced storage (lives on the delegating EOA)
    // -----------------------------------------------------------------------

    struct State {
        /// @dev credentialId → revoked
        mapping(bytes32 => bool) revocations;
        /// @dev relay nonce (signed by the EOA for the BySig variants).
        uint256 nonce;
    }

    function _state() private pure returns (State storage s) {
        bytes32 slot = keccak256("ethr-7702.RevocationDIDManager7702");
        assembly {
            s.slot := slot
        }
    }

    function revocations(bytes32 credentialId) external view returns (bool) {
        return _state().revocations[credentialId];
    }

    /// @notice Relay nonce (signed by the EOA for the BySig variants).
    function getNonce() external view returns (uint256) {
        return _state().nonce;
    }

    // --- EIP-712 type hashes (for the gasless BySig relay) ---

    bytes32 private constant DOMAIN_TYPE_HASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 private constant SET_ATTR_TYPE_HASH =
        keccak256(
            "SetAttribute(address registry,bytes32 name,bytes value,uint256 validity,uint256 nonce)"
        );

    bytes32 private constant REVOKE_ATTR_TYPE_HASH =
        keccak256(
            "RevokeAttribute(address registry,bytes32 name,bytes value,uint256 nonce)"
        );

    bytes32 private constant REVOKE_CRED_TYPE_HASH =
        keccak256("RevokeCredential(bytes32 credentialId,uint256 nonce)");

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

    /// @notice Gasless variant of `setAttributeForIdentity`: the EOA signs an
    ///         EIP-712 intent off-chain; a broadcaster relays it and pays gas.
    function setAttributeForIdentityBySig(
        address registry,
        bytes32 name,
        bytes calldata value,
        uint256 validity,
        bytes calldata _signature
    ) external {
        State storage s = _state();
        bytes32 digest = _digest(
            SET_ATTR_TYPE_HASH,
            keccak256(abi.encode(SET_ATTR_TYPE_HASH, registry, name, keccak256(value), validity, s.nonce))
        );
        require(_recoverSigner(digest, _signature) == address(this), "invalid signature");
        s.nonce++;
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

    /// @notice Gasless variant of `revokeAttributeForIdentity`: the EOA signs an
    ///         EIP-712 intent off-chain; a broadcaster relays it and pays gas.
    function revokeAttributeForIdentityBySig(
        address registry,
        bytes32 name,
        bytes calldata value,
        bytes calldata _signature
    ) external {
        State storage s = _state();
        bytes32 digest = _digest(
            REVOKE_ATTR_TYPE_HASH,
            keccak256(abi.encode(REVOKE_ATTR_TYPE_HASH, registry, name, keccak256(value), s.nonce))
        );
        require(_recoverSigner(digest, _signature) == address(this), "invalid signature");
        s.nonce++;
        IEthereumDIDRegistry(registry).revokeAttribute(address(this), name, value);
    }

    // -----------------------------------------------------------------------
    // Credential-level revocation registry
    // -----------------------------------------------------------------------

    /// @notice Marks a credential as revoked. Only callable by the EOA owner.
    /// @param credentialId  Arbitrary identifier — e.g. keccak256(abi.encode(vcId)).
    function revokeCredential(bytes32 credentialId) external {
        require(msg.sender == address(this), "only owner");
        _state().revocations[credentialId] = true;
        emit CredentialRevoked(credentialId, block.timestamp);
    }

    /// @notice Gasless variant of `revokeCredential`: the EOA signs an EIP-712
    ///         intent off-chain; a broadcaster relays it and pays gas.
    function revokeCredentialBySig(
        bytes32 credentialId,
        bytes calldata _signature
    ) external {
        State storage s = _state();
        bytes32 digest = _digest(
            REVOKE_CRED_TYPE_HASH,
            keccak256(abi.encode(REVOKE_CRED_TYPE_HASH, credentialId, s.nonce))
        );
        require(_recoverSigner(digest, _signature) == address(this), "invalid signature");
        s.nonce++;
        s.revocations[credentialId] = true;
        emit CredentialRevoked(credentialId, block.timestamp);
    }

    /// @notice Returns true if the credential has been revoked by this identity.
    /// @dev    Callable on the EOA's address after delegation is set.
    function isRevoked(bytes32 credentialId) external view returns (bool) {
        return _state().revocations[credentialId];
    }

    // --- Internal helpers ---

    function _digest(bytes32 /*typeHash*/, bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_TYPE_HASH,
                keccak256("RevocationDIDManager7702"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    function _recoverSigner(bytes32 digest, bytes memory sig) internal pure returns (address) {
        require(sig.length == 65, "invalid sig length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "invalid v");
        // EIP-2: reject high-s signatures to prevent malleability
        require(uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0, "invalid s");
        address recovered = ecrecover(digest, v, r, s);
        require(recovered != address(0), "ecrecover failed");
        return recovered;
    }
}

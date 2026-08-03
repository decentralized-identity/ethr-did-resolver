// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

interface IEthereumDIDRegistry {
    function setAttribute(
        address identity,
        bytes32 name,
        bytes calldata value,
        uint256 validity
    ) external;
}

/// @title MetaTxDIDManager7702
/// @notice EIP-7702 delegation contract enabling gasless DID attribute updates via
///         EIP-712 signed meta-transactions. The EOA (identity owner) signs an intent
///         off-chain; a relayer submits the transaction and pays gas.
///
///         Flow:
///           1. EOA delegates to this contract (via EIP-7702 auth tx, included in the
///              relayer's type-4 tx on first use — no ETH needed from the EOA).
///           2. Off-chain: EOA signs an EIP-712 `SetAttribute` or `SetBatchAttributes`
///              struct containing the attribute details and a nonce.
///           3. A relayer submits the signed message to the network.
///           4. This contract verifies: (a) signature recovers to address(this) (the EOA),
///              (b) nonce matches. Then it calls setAttribute on the registry.
///
///         Single-chain: the domain includes chainId to prevent cross-chain replay.
///         The intent struct does NOT carry a chainId — that binding is in the domain.
///
///         Replay protection: per-EOA nonce (in EOA storage) incremented on each update.
///
///         EIP-712 domain:
///           name            = "MetaTxDIDManager7702"
///           version         = "1"
///           chainId         = block.chainid
///           verifyingContract = address(this)  (= the EOA at call time)
///
///         Storage layout (on the delegating EOA):
///           Namespaced storage at slot keccak256("ethr-7702.MetaTxDIDManager7702"):
///             base + 0 — nonce (uint256)
///
///         The slot is a per-manager namespace derived from the contract name, so
///         re-delegating a single EOA between different managers can never collide
///         with their state.
contract MetaTxDIDManager7702 {
    // -----------------------------------------------------------------------
    // Namespaced storage (lives on the delegating EOA)
    // -----------------------------------------------------------------------

    struct State {
        uint256 nonce;
    }

    function _state() private pure returns (State storage s) {
        bytes32 slot = keccak256("ethr-7702.MetaTxDIDManager7702");
        assembly {
            s.slot := slot
        }
    }

    /// @notice Returns the current nonce for replay protection.
    function getNonce() external view returns (uint256) {
        return _state().nonce;
    }

    /// @notice Alias for `getNonce` (public-variable getter parity).
    function nonce() external view returns (uint256) {
        return _state().nonce;
    }

    // -----------------------------------------------------------------------
    // EIP-712 type hashes
    // -----------------------------------------------------------------------

    bytes32 private constant DOMAIN_TYPE_HASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 private constant SET_ATTR_TYPE_HASH =
        keccak256(
            "SetAttribute(address registry,bytes32 name,bytes value,uint256 validity,uint256 nonce)"
        );

    bytes32 private constant ATTR_UPDATE_TYPE_HASH =
        keccak256("AttributeUpdate(bytes32 name,bytes value,uint256 validity)");

    bytes32 private constant SET_BATCH_TYPE_HASH =
        keccak256(
            "SetBatchAttributes(address registry,AttributeUpdate[] updates,uint256 nonce)"
            "AttributeUpdate(bytes32 name,bytes value,uint256 validity)"
        );

    // -----------------------------------------------------------------------
    // Structs
    // -----------------------------------------------------------------------

    struct AttributeUpdate {
        bytes32 name;
        bytes value;
        uint256 validity;
    }

    // -----------------------------------------------------------------------
    // Meta-transaction: single setAttribute
    // -----------------------------------------------------------------------

    /// @notice Execute a DID attribute update authorised by the EOA off-chain.
    /// @param registry  ERC-1056 registry address.
    /// @param name      Attribute name (bytes32).
    /// @param value     Attribute value.
    /// @param validity  Validity period in seconds.
    /// @param signature 65-byte ECDSA signature from the EOA over the EIP-712 digest.
    function setAttribute(
        address registry,
        bytes32 name,
        bytes calldata value,
        uint256 validity,
        bytes calldata signature
    ) external {
        State storage s = _state();
        bytes32 digest = attributeDigest(registry, name, value, validity, s.nonce);
        address recovered = _recoverSigner(digest, signature);
        require(recovered == address(this), "invalid signature");

        s.nonce++;
        IEthereumDIDRegistry(registry).setAttribute(address(this), name, value, validity);
    }

    // -----------------------------------------------------------------------
    // Meta-transaction: batch setAttribute
    // -----------------------------------------------------------------------

    /// @notice Execute multiple DID attribute updates in one meta-transaction.
    /// @param registry  ERC-1056 registry address.
    /// @param updates   Array of attribute updates to apply atomically.
    /// @param signature 65-byte ECDSA signature from the EOA over the EIP-712 batch digest.
    function setBatchAttributes(
        address registry,
        AttributeUpdate[] calldata updates,
        bytes calldata signature
    ) external {
        State storage s = _state();
        bytes32 digest = batchAttributeDigest(registry, updates, s.nonce);
        address recovered = _recoverSigner(digest, signature);
        require(recovered == address(this), "invalid signature");

        s.nonce++;
        IEthereumDIDRegistry reg = IEthereumDIDRegistry(registry);
        for (uint256 i = 0; i < updates.length; i++) {
            reg.setAttribute(address(this), updates[i].name, updates[i].value, updates[i].validity);
        }
    }

    // -----------------------------------------------------------------------
    // View helpers
    // -----------------------------------------------------------------------

    /// @notice Compute the EIP-712 digest the EOA must sign for a single setAttribute.
    /// @param registry ERC-1056 registry address.
    /// @param name     Attribute name.
    /// @param value    Attribute value.
    /// @param validity Validity period in seconds.
    /// @param _nonce   Nonce to use in the digest (pass current nonce for signing).
    function attributeDigest(
        address registry,
        bytes32 name,
        bytes calldata value,
        uint256 validity,
        uint256 _nonce
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(SET_ATTR_TYPE_HASH, registry, name, keccak256(value), validity, _nonce)
        );
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
    }

    /// @notice Compute the EIP-712 digest the EOA must sign for a batch update.
    /// @param registry ERC-1056 registry address.
    /// @param updates  Array of attribute updates.
    /// @param _nonce   Nonce to use in the digest (pass current nonce for signing).
    function batchAttributeDigest(
        address registry,
        AttributeUpdate[] calldata updates,
        uint256 _nonce
    ) public view returns (bytes32) {
        // Hash each AttributeUpdate individually, then hash the array
        bytes32[] memory updateHashes = new bytes32[](updates.length);
        for (uint256 i = 0; i < updates.length; i++) {
            updateHashes[i] = keccak256(
                abi.encode(
                    ATTR_UPDATE_TYPE_HASH,
                    updates[i].name,
                    keccak256(updates[i].value),
                    updates[i].validity
                )
            );
        }
        bytes32 updatesHash = keccak256(abi.encodePacked(updateHashes));

        bytes32 structHash = keccak256(
            abi.encode(SET_BATCH_TYPE_HASH, registry, updatesHash, _nonce)
        );
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_TYPE_HASH,
                keccak256("MetaTxDIDManager7702"),
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

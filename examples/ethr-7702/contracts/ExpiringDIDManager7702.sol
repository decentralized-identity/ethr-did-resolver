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

/// @title ExpiringDIDManager7702
/// @notice EIP-7702 delegation contract with an app-level expiry.
///
///         EIP-7702 has no protocol-level TTL for authorization tuples.
///         This contract implements an application-layer workaround: the EOA
///         configures an `expiry` timestamp, and all DID attribute writes revert
///         once `block.timestamp > expiry`.
///
///         Flow:
///           1. EOA delegates to this contract via EIP-7702.
///           2. EOA calls `configure(expiry)` to set the deadline.
///           3. Any caller may invoke `setAttributeForIdentity` before `expiry`.
///           4. After `expiry`, all writes revert with "delegation expired".
///           5. EOA may call `configure(newExpiry)` to renew or `configure(0)` to
///              permanently disable writes without revoking the delegation itself.
///
///         Note: revoking the EIP-7702 delegation (authorize address(0) in a new
///         type-4 tx) also stops all writes — but that is a protocol-level revocation,
///         not an app-level one.
///
///         Storage layout (on the delegating EOA):
///           Namespaced storage at slot keccak256("ethr-7702.ExpiringDIDManager7702"):
///             base + 0 — expiry (uint256)
///             base + 1 — nonce  (uint256) configure relay nonce
///
///         The slot is a per-manager namespace derived from the contract name, so
///         re-delegating a single EOA between different managers can never collide
///         with their state.
contract ExpiringDIDManager7702 {
    // -----------------------------------------------------------------------
    // Namespaced storage (lives on the delegating EOA)
    // -----------------------------------------------------------------------

    struct State {
        /// @notice Unix timestamp after which all DID writes revert.
        ///         Zero means "not configured" — all writes revert until configured.
        uint256 expiry;
        /// @notice relay nonce (signed by the EOA for `configureBySig`).
        uint256 nonce;
    }

    function _state() private pure returns (State storage s) {
        bytes32 slot = keccak256("ethr-7702.ExpiringDIDManager7702");
        assembly {
            s.slot := slot
        }
    }

    /// @notice Returns the configured expiry timestamp.
    function expiry() external view returns (uint256) {
        return _state().expiry;
    }

    /// @notice Relay nonce (signed by the EOA for `configureBySig`).
    function getNonce() external view returns (uint256) {
        return _state().nonce;
    }

    // --- EIP-712 type hashes (for the gasless configure relay) ---

    bytes32 private constant DOMAIN_TYPE_HASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 private constant CONFIGURE_TYPE_HASH =
        keccak256("Configure(uint256 expiry,uint256 nonce)");

    // -----------------------------------------------------------------------
    // Configuration
    // -----------------------------------------------------------------------

    /// @notice Set the expiry timestamp. Only callable by the EOA owner.
    /// @param _expiry  Unix timestamp. Pass a future timestamp to enable writes.
    ///                 Pass 0 to disable writes (no writes until reconfigured).
    function configure(uint256 _expiry) external {
        require(msg.sender == address(this), "only owner");
        _configure(_expiry);
    }

    /// @notice Gasless variant of `configure`: the EOA signs an EIP-712 intent
    ///         off-chain; a broadcaster relays it and pays gas.
    function configureBySig(
        uint256 _expiry,
        bytes calldata _signature
    ) external {
        State storage s = _state();

        bytes32 structHash = keccak256(abi.encode(CONFIGURE_TYPE_HASH, _expiry, s.nonce));
        bytes32 domainSeparator = keccak256(
            abi.encode(
                DOMAIN_TYPE_HASH,
                keccak256("ExpiringDIDManager7702"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));

        require(_recoverSigner(digest, _signature) == address(this), "invalid signature");

        s.nonce++;
        _configure(_expiry);
    }

    function _configure(uint256 _expiry) internal {
        _state().expiry = _expiry;
        emit ExpiryConfigured(_expiry);
    }

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event ExpiryConfigured(uint256 expiry);

    // -----------------------------------------------------------------------
    // DID attribute management
    // -----------------------------------------------------------------------

    /// @notice Set a DID attribute for this identity.
    ///         Reverts if the delegation has expired or not yet been configured.
    /// @dev    No `msg.sender` check — any account can trigger a write on behalf
    ///         of the delegating EOA, as long as the expiry hasn't passed.
    ///         This mirrors the DIDManager7702 open-relayer design.
    function setAttributeForIdentity(
        address registry,
        bytes32 name,
        bytes calldata value,
        uint256 validity
    ) external {
        uint256 expiry = _state().expiry;
        require(expiry != 0, "not configured");
        require(block.timestamp <= expiry, "delegation expired");
        IEthereumDIDRegistry(registry).setAttribute(address(this), name, value, validity);
    }

    // -----------------------------------------------------------------------
    // View helpers
    // -----------------------------------------------------------------------

    /// @notice Returns true if the delegation is currently active (configured and not expired).
    function isActive() external view returns (bool) {
        uint256 expiry = _state().expiry;
        return expiry != 0 && block.timestamp <= expiry;
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

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

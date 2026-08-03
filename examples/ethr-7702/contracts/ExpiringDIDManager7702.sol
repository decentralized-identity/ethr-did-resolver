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

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event ExpiryConfigured(uint256 expiry);

    // -----------------------------------------------------------------------
    // Configuration
    // -----------------------------------------------------------------------

    /// @notice Set the expiry timestamp. Only callable by the EOA owner.
    /// @param _expiry  Unix timestamp. Pass a future timestamp to enable writes.
    ///                 Pass 0 to disable writes (no writes until reconfigured).
    function configure(uint256 _expiry) external {
        require(msg.sender == address(this), "only owner");
        _state().expiry = _expiry;
        emit ExpiryConfigured(_expiry);
    }

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
}

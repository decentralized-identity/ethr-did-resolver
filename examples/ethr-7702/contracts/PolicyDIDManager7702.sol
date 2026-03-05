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

/// @title PolicyDIDManager7702
/// @notice EIP-7702 delegation contract with a session-key policy.
///
///         The EOA (owner) delegates to this contract and separately registers
///         a session key via `setSessionKey`. The session key can then call
///         `setAttribute` on the owner's behalf — but only for attribute names
///         that start with a specific allowed prefix (e.g. "did/pub/").
///
///         Security properties demonstrated:
///         - Only the owner (address(this) == EOA) can change the session key.
///         - Only the current session key can update DID attributes.
///         - Attribute name is constrained to a caller-configurable prefix.
///         - Validity is capped at a maximum to prevent indefinite grants.
contract PolicyDIDManager7702 {
    // --- Storage ---

    /// @dev The authorised session key for this identity.
    ///      address(this) is the EOA; storage slots belong to the EOA.
    address public sessionKey;

    /// @dev Maximum validity in seconds that the session key may grant.
    uint256 public maxValidity;

    /// @dev Allowed attribute name prefix (bytes32, right-padded with zeros).
    ///      Only attribute names that start with this prefix are accepted.
    bytes32 public allowedPrefix;

    // --- Owner-only configuration (called via 7702 delegation by the EOA itself) ---

    /// @notice Configures the session key and policy parameters.
    ///         Must be called by the EOA owner (i.e. address(this)).
    function configure(
        address _sessionKey,
        uint256 _maxValidity,
        bytes32 _allowedPrefix
    ) external {
        require(msg.sender == address(this), "only owner");
        sessionKey = _sessionKey;
        maxValidity = _maxValidity;
        allowedPrefix = _allowedPrefix;
    }

    // --- Session-key-accessible update ---

    /// @notice Sets a DID attribute on behalf of the delegating EOA.
    ///         Only callable by the registered session key.
    ///         Enforces prefix policy and validity cap.
    function setAttributeViaSessionKey(
        address registry,
        bytes32 name,
        bytes calldata value,
        uint256 validity
    ) external {
        require(msg.sender == sessionKey, "not session key");
        require(validity <= maxValidity, "validity exceeds cap");
        require(_hasPrefix(name, allowedPrefix), "name prefix not allowed");

        IEthereumDIDRegistry(registry).setAttribute(address(this), name, value, validity);
    }

    // --- Internal helpers ---

    /// @dev Returns true if `name` starts with `prefix` (ignoring trailing zero bytes in prefix).
    function _hasPrefix(bytes32 name, bytes32 prefix) internal pure returns (bool) {
        // Find the length of the prefix (bytes until first zero byte)
        uint256 prefixLen = 0;
        for (uint256 i = 0; i < 32; i++) {
            if (prefix[i] == 0x00) break;
            prefixLen++;
        }
        // If no prefix configured, allow everything
        if (prefixLen == 0) return true;
        // Check that the first prefixLen bytes of name match prefix
        for (uint256 i = 0; i < prefixLen; i++) {
            if (name[i] != prefix[i]) return false;
        }
        return true;
    }
}

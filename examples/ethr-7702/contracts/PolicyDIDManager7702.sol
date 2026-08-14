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
///         a session key via `configure`. The session key can then call
///         `setAttribute` on the owner's behalf — but only for attribute names
///         that start with a specific allowed prefix (e.g. "did/pub/").
///
///         Gasless relay: the EOA-gated `configure` and the session-key-gated
///         `setAttributeViaSessionKey` both have EIP-712 `...BySig` variants. The
///         owner (or session key) signs an intent off-chain; a broadcaster relays
///         it and pays gas. Replay protection is a per-manager nonce pair stored
///         in the delegating EOA's storage.
///
///         Security properties demonstrated:
///         - Only the owner (address(this) == EOA) can change the session key.
///         - Only the current session key can update DID attributes.
///         - Attribute name is constrained to a caller-configurable prefix.
///         - Validity is capped at a maximum to prevent indefinite grants.
///
///         Namespaced storage (ERC-7201 style) at slot
///         keccak256("ethr-7702.PolicyDIDManager7702") — see MultiSigDIDManager7702
///         for why state is anchored at a per-manager keccak-derived slot.
///
///         Storage layout (on the delegating EOA):
///           base + 0 — sessionKey  (address)
///           base + 1 — maxValidity (uint256)
///           base + 2 — allowedPrefix (bytes32)
///           base + 3 — nonce       (uint256)  EOA configure relay nonce
///           base + 4 — sessionNonce (uint256) session-key relay nonce
///
///         EIP-712 domain (for both BySig functions):
///           name            = "PolicyDIDManager7702"
///           version         = "1"
///           chainId         = block.chainid
///           verifyingContract = address(this)  (= the EOA at call time)
contract PolicyDIDManager7702 {
    // -----------------------------------------------------------------------
    // Namespaced storage (lives on the delegating EOA)
    // -----------------------------------------------------------------------

    struct State {
        address sessionKey;
        uint256 maxValidity;
        bytes32 allowedPrefix;
        uint256 nonce;
        uint256 sessionNonce;
    }

    function _state() private pure returns (State storage s) {
        bytes32 slot = keccak256("ethr-7702.PolicyDIDManager7702");
        assembly {
            s.slot := slot
        }
    }

    // --- Public getters (read from the namespaced slot) ---

    function sessionKey() external view returns (address) {
        return _state().sessionKey;
    }

    function maxValidity() external view returns (uint256) {
        return _state().maxValidity;
    }

    function allowedPrefix() external view returns (bytes32) {
        return _state().allowedPrefix;
    }

    /// @notice Configure relay nonce (signed by the EOA).
    function getNonce() external view returns (uint256) {
        return _state().nonce;
    }

    /// @notice Session-key relay nonce (signed by the session key).
    function getSessionNonce() external view returns (uint256) {
        return _state().sessionNonce;
    }

    // --- EIP-712 type hashes ---

    bytes32 private constant DOMAIN_TYPE_HASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 private constant CONFIGURE_TYPE_HASH =
        keccak256(
            "Configure(address sessionKey,uint256 maxValidity,bytes32 allowedPrefix,uint256 nonce)"
        );

    bytes32 private constant SESSION_UPDATE_TYPE_HASH =
        keccak256(
            "SetAttributeViaSessionKey(address registry,bytes32 name,bytes value,uint256 validity,uint256 nonce)"
        );

    // --- Owner-only configuration (called via 7702 delegation by the EOA itself) ---

    /// @notice Configures the session key and policy parameters.
    ///         Must be called by the EOA owner (i.e. address(this)).
    function configure(
        address _sessionKey,
        uint256 _maxValidity,
        bytes32 _allowedPrefix
    ) external {
        require(msg.sender == address(this), "only owner");
        _configure(_sessionKey, _maxValidity, _allowedPrefix);
    }

    /// @notice Gasless variant of `configure`. The EOA signs an EIP-712 intent
    ///         off-chain; a broadcaster relays it and pays gas.
    function configureBySig(
        address _sessionKey,
        uint256 _maxValidity,
        bytes32 _allowedPrefix,
        bytes calldata _signature
    ) external {
        State storage s = _state();

        bytes32 digest = _digest(
            CONFIGURE_TYPE_HASH,
            keccak256(abi.encode(CONFIGURE_TYPE_HASH, _sessionKey, _maxValidity, _allowedPrefix, s.nonce))
        );
        require(_recoverSigner(digest, _signature) == address(this), "invalid signature");

        s.nonce++;
        _configure(_sessionKey, _maxValidity, _allowedPrefix);
    }

    function _configure(
        address _sessionKey,
        uint256 _maxValidity,
        bytes32 _allowedPrefix
    ) internal {
        State storage s = _state();
        s.sessionKey = _sessionKey;
        s.maxValidity = _maxValidity;
        s.allowedPrefix = _allowedPrefix;
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
        State storage s = _state();
        require(msg.sender == s.sessionKey, "not session key");
        _applyPolicyAndSet(s, registry, name, value, validity);
    }

    /// @notice Gasless variant of `setAttributeViaSessionKey`. The registered
    ///         session key signs an EIP-712 intent off-chain; a broadcaster
    ///         relays it and pays gas.
    function setAttributeViaSessionKeyBySig(
        address registry,
        bytes32 name,
        bytes calldata value,
        uint256 validity,
        bytes calldata _signature
    ) external {
        State storage s = _state();

        bytes32 digest = _digest(
            SESSION_UPDATE_TYPE_HASH,
            keccak256(abi.encode(SESSION_UPDATE_TYPE_HASH, registry, name, keccak256(value), validity, s.sessionNonce))
        );
        require(_recoverSigner(digest, _signature) == s.sessionKey, "invalid signature");

        s.sessionNonce++;
        _applyPolicyAndSet(s, registry, name, value, validity);
    }

    function _applyPolicyAndSet(
        State storage s,
        address registry,
        bytes32 name,
        bytes calldata value,
        uint256 validity
    ) internal {
        require(validity <= s.maxValidity, "validity exceeds cap");
        require(_hasPrefix(name, s.allowedPrefix), "name prefix not allowed");
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

    function _digest(bytes32 /*typeHash*/, bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_TYPE_HASH,
                keccak256("PolicyDIDManager7702"),
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

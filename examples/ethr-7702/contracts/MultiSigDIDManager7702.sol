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

/// @title MultiSigDIDManager7702
/// @notice EIP-7702 delegation contract requiring M-of-N co-signer approval for DID updates.
///
///         The EOA delegates to this contract and calls `configure` to register N signer
///         addresses and a threshold M.  Any caller may then submit an attribute update
///         together with M distinct ECDSA signatures over the canonical update digest;
///         the contract verifies signatures before forwarding to the ERC-1056 registry.
///
///         Replay protection: a per-EOA nonce (stored in the EOA's own storage) is
///         incremented after every successful update.
///
///         Storage layout (on the delegating EOA):
///           Namespaced storage at slot keccak256("ethr-7702.MultiSigDIDManager7702"):
///             base + 0 — signers[] (dynamic array length; elements at keccak256(base))
///             base + 1 — threshold  (uint256)
///             base + 2 — nonce      (uint256)
///
///         The slot is a per-manager namespace derived from the contract name, so
///         re-delegating a single EOA between different managers can never collide
///         with their state (they live at distinct keccak-derived slots).
///
/// @dev    All storage reads/writes affect the delegating EOA's storage, not this
///         contract's storage, because address(this) == EOA at call time.
contract MultiSigDIDManager7702 {
    // -----------------------------------------------------------------------
    // Namespaced storage (lives on the delegating EOA)
    // -----------------------------------------------------------------------

    /// @dev ERC-7201-style namespace for this manager's state. No `-1` mask is
    ///      applied so the slot can never overlap EIP-1967 proxy slots.
    struct State {
        address[] signers;
        uint256 threshold;
        uint256 nonce;
    }

    function _state() private pure returns (State storage s) {
        bytes32 slot = keccak256("ethr-7702.MultiSigDIDManager7702");
        assembly {
            s.slot := slot
        }
    }

    // -----------------------------------------------------------------------
    // Public getters (read from the namespaced slot)
    // -----------------------------------------------------------------------

    function getSigners() external view returns (address[] memory) {
        return _state().signers;
    }

    function signers(uint256 index) external view returns (address) {
        return _state().signers[index];
    }

    function threshold() external view returns (uint256) {
        return _state().threshold;
    }

    function nonce() external view returns (uint256) {
        return _state().nonce;
    }

    // -----------------------------------------------------------------------
    // EIP-712 type hashes (for the gasless configure relay)
    // -----------------------------------------------------------------------

    bytes32 private constant DOMAIN_TYPE_HASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 private constant CONFIGURE_TYPE_HASH =
        keccak256("Configure(address[] signers,uint256 threshold,uint256 nonce)");

    // -----------------------------------------------------------------------
    // Configuration — only callable by the EOA itself (via 7702 self-call)
    // -----------------------------------------------------------------------

    /// @notice Configures the signer set and approval threshold.
    ///         Must be called by the EOA owner (msg.sender == address(this)).
    /// @param _signers  Ordered list of authorized co-signer addresses.
    /// @param _threshold  Minimum number of signatures required (1 <= _threshold <= len(_signers)).
    function configure(address[] calldata _signers, uint256 _threshold) external {
        require(msg.sender == address(this), "only owner");
        _configure(_signers, _threshold);
    }

    /// @notice Gasless variant of `configure`. The EOA signs an EIP-712 intent
    ///         off-chain; a broadcaster relays it and pays gas. Replay protection
    ///         reuses the per-EOA update nonce (State.nonce).
    function configureBySig(
        address[] calldata _signers,
        uint256 _threshold,
        bytes calldata _signature
    ) external {
        State storage s = _state();

        bytes32 signersHash = keccak256(abi.encodePacked(_signers));
        bytes32 structHash = keccak256(
            abi.encode(CONFIGURE_TYPE_HASH, signersHash, _threshold, s.nonce)
        );
        bytes32 domainSeparator = keccak256(
            abi.encode(
                DOMAIN_TYPE_HASH,
                keccak256("MultiSigDIDManager7702"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));

        require(_recoverSigner(digest, _signature) == address(this), "invalid signature");

        s.nonce++;
        _configure(_signers, _threshold);
    }

    function _configure(address[] calldata _signers, uint256 _threshold) internal {
        require(_threshold >= 1 && _threshold <= _signers.length, "invalid threshold");

        State storage s = _state();

        // Reset signer set
        delete s.signers;
        for (uint256 i = 0; i < _signers.length; i++) {
            require(_signers[i] != address(0), "zero signer");
            // Require strictly ascending order to prevent duplicates in O(n) without a mapping
            require(i == 0 || _signers[i] > _signers[i - 1], "signers not sorted/dup");
            s.signers.push(_signers[i]);
        }
        s.threshold = _threshold;
    }

    // -----------------------------------------------------------------------
    // Multi-sig DID attribute update
    // -----------------------------------------------------------------------

    /// @notice Updates a DID attribute after verifying M-of-N co-signer approval.
    /// @param registry  ERC-1056 registry address.
    /// @param name      Attribute name (bytes32).
    /// @param value     Attribute value.
    /// @param validity  Attribute validity period in seconds.
    /// @param sigs      Exactly `threshold` signatures over the update digest,
    ///                  ordered by ascending signer address to prevent duplicates.
    function setAttributeWithMultiSig(
        address registry,
        bytes32 name,
        bytes calldata value,
        uint256 validity,
        bytes[] calldata sigs
    ) external {
        State storage s = _state();
        require(s.threshold > 0, "not configured");
        require(sigs.length >= s.threshold, "not enough signatures");

        // Build the digest that signers must have signed
        bytes32 digest = _updateDigest(registry, name, value, validity, s.nonce);

        // Recover signers and verify they are authorised + ordered (no duplicates)
        address prev = address(0);
        uint256 verified = 0;

        for (uint256 i = 0; i < sigs.length && verified < s.threshold; i++) {
            address recovered = _recoverSigner(digest, sigs[i]);
            require(recovered > prev, "sigs not ordered / duplicate");
            require(_isSigner(recovered), "not a registered signer");
            verified++;
            prev = recovered;
        }

        require(verified >= s.threshold, "threshold not met");

        s.nonce++;
        IEthereumDIDRegistry(registry).setAttribute(address(this), name, value, validity);
    }

    // -----------------------------------------------------------------------
    // View helpers
    // -----------------------------------------------------------------------

    /// @notice Returns the EIP-191 digest that co-signers must sign.
    function updateDigest(
        address registry,
        bytes32 name,
        bytes calldata value,
        uint256 validity,
        uint256 _nonce
    ) external view returns (bytes32) {
        return _updateDigest(registry, name, value, validity, _nonce);
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    function _updateDigest(
        address registry,
        bytes32 name,
        bytes memory value,
        uint256 validity,
        uint256 _nonce
    ) internal view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(abi.encode(address(this), registry, name, value, validity, _nonce))
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

    function _isSigner(address addr) internal view returns (bool) {
        address[] storage signers = _state().signers;
        for (uint256 i = 0; i < signers.length; i++) {
            if (signers[i] == addr) return true;
        }
        return false;
    }
}

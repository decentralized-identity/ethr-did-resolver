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
///           slot 0  — signers[]  (dynamic array length)
///           slot 1  — threshold  (uint256)
///           slot 2  — nonce      (uint256)
///           slot keccak256(0)… — signer addresses (array elements)
///
/// @dev    All storage reads/writes affect the delegating EOA's storage, not this
///         contract's storage, because address(this) == EOA at call time.
contract MultiSigDIDManager7702 {
    // -----------------------------------------------------------------------
    // Storage (lives on the delegating EOA)
    // -----------------------------------------------------------------------

    address[] public signers;
    uint256 public threshold;
    uint256 public nonce;

    // -----------------------------------------------------------------------
    // Configuration — only callable by the EOA itself (via 7702 self-call)
    // -----------------------------------------------------------------------

    /// @notice Configures the signer set and approval threshold.
    ///         Must be called by the EOA owner (msg.sender == address(this)).
    /// @param _signers  Ordered list of authorized co-signer addresses.
    /// @param _threshold  Minimum number of signatures required (1 <= _threshold <= len(_signers)).
    function configure(address[] calldata _signers, uint256 _threshold) external {
        require(msg.sender == address(this), "only owner");
        require(_threshold >= 1 && _threshold <= _signers.length, "invalid threshold");

        // Reset signer set
        delete signers;
        for (uint256 i = 0; i < _signers.length; i++) {
            require(_signers[i] != address(0), "zero signer");
            // Require strictly ascending order to prevent duplicates in O(n) without a mapping
            require(i == 0 || _signers[i] > _signers[i - 1], "signers not sorted/dup");
            signers.push(_signers[i]);
        }
        threshold = _threshold;
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
        require(threshold > 0, "not configured");
        require(sigs.length >= threshold, "not enough signatures");

        // Build the digest that signers must have signed
        bytes32 digest = _updateDigest(registry, name, value, validity, nonce);

        // Recover signers and verify they are authorised + ordered (no duplicates)
        address prev = address(0);
        uint256 verified = 0;

        for (uint256 i = 0; i < sigs.length && verified < threshold; i++) {
            address recovered = _recoverSigner(digest, sigs[i]);
            require(recovered > prev, "sigs not ordered / duplicate");
            require(_isSigner(recovered), "not a registered signer");
            verified++;
            prev = recovered;
        }

        require(verified >= threshold, "threshold not met");

        nonce++;
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

    function getSigners() external view returns (address[] memory) {
        return signers;
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
        for (uint256 i = 0; i < signers.length; i++) {
            if (signers[i] == addr) return true;
        }
        return false;
    }
}

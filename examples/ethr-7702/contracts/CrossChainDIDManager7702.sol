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

/// @title CrossChainDIDManager7702
/// @notice EIP-7702 delegation contract enabling EOA-authorised DID updates on any
///         chain without the EOA being online on that chain.
///
///         Flow:
///           1. EOA delegates to this contract on Chain B (via EIP-7702 auth tx on B).
///              If the EOA has no ETH on B, a sponsor can include the authorization in
///              their own type-4 tx.
///           2. Off-chain: EOA signs an EIP-712 `UpdateAuthorization` struct containing
///              the attribute details, the target chainId, and a nonce.
///           3. A relayer submits the signed message to Chain B.
///           4. This contract verifies: (a) signature comes from address(this) (the EOA),
///              (b) chainId matches, (c) nonce hasn't been used.
///              Then it calls setAttribute on Chain B's registry.
///
///         Replay protection: per-EOA nonce (in EOA storage) incremented each use.
///
///         EIP-712 domain:
///           name    = "CrossChainDIDManager7702"
///           version = "1"
///           chainId = block.chainid
///           verifyingContract = address(this)  (= the EOA at call time)
///
///         Storage layout (on the delegating EOA):
///           slot 0 — crossChainNonce (uint256)
contract CrossChainDIDManager7702 {
    // -----------------------------------------------------------------------
    // Storage
    // -----------------------------------------------------------------------

    uint256 public crossChainNonce;

    // -----------------------------------------------------------------------
    // EIP-712 type hashes
    // -----------------------------------------------------------------------

    bytes32 private constant DOMAIN_TYPE_HASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 private constant UPDATE_AUTH_TYPE_HASH =
        keccak256(
            "UpdateAuthorization(address registry,bytes32 name,bytes value,uint256 validity,uint256 nonce)"
        );

    // -----------------------------------------------------------------------
    // Cross-chain update
    // -----------------------------------------------------------------------

    /// @notice Execute a DID attribute update authorised by the EOA off-chain.
    /// @param registry    ERC-1056 registry on this chain.
    /// @param name        Attribute name.
    /// @param value       Attribute value.
    /// @param validity    Validity period in seconds.
    /// @param signature   65-byte ECDSA signature from the EOA over the EIP-712 digest.
    function setAttributeCrossChain(
        address registry,
        bytes32 name,
        bytes calldata value,
        uint256 validity,
        bytes calldata signature
    ) external {
        // Build the EIP-712 digest
        bytes32 structHash = keccak256(
            abi.encode(UPDATE_AUTH_TYPE_HASH, registry, name, keccak256(value), validity, crossChainNonce)
        );

        bytes32 domainSeparator = keccak256(
            abi.encode(
                DOMAIN_TYPE_HASH,
                keccak256("CrossChainDIDManager7702"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));

        // Recover the signer — must be the EOA (address(this))
        address recovered = _recoverSigner(digest, signature);
        require(recovered == address(this), "invalid signature");

        crossChainNonce++;

        IEthereumDIDRegistry(registry).setAttribute(address(this), name, value, validity);
    }

    // -----------------------------------------------------------------------
    // View helpers
    // -----------------------------------------------------------------------

    /// @notice Compute the EIP-712 digest the EOA must sign for a given update.
    function updateDigest(
        address registry,
        bytes32 name,
        bytes calldata value,
        uint256 validity,
        uint256 nonce
    ) external view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(UPDATE_AUTH_TYPE_HASH, registry, name, keccak256(value), validity, nonce)
        );

        bytes32 domainSeparator = keccak256(
            abi.encode(
                DOMAIN_TYPE_HASH,
                keccak256("CrossChainDIDManager7702"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );

        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
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

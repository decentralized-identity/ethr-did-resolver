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

/// @title DIDManager7702
/// @notice Delegation contract for EIP-7702 EOA DID management.
///         Deploy once; EOAs delegate to it via EIP-7702 authorization.
///         When called via delegation, address(this) == the EOA's address.
contract DIDManager7702 {
    /// @notice Sets a DID attribute for this identity (the delegating EOA).
    /// @dev Callable when an EOA has delegated to this contract via EIP-7702.
    ///      msg.sender must be this contract (i.e., a self-call from the EOA).
    ///      In the delegation context, address(this) == EOA address, so
    ///      setAttribute(address(this), ...) authenticates as the EOA owner.
    function setAttributeForIdentity(
        address registry,
        bytes32 name,
        bytes calldata value,
        uint256 validity
    ) external {
        IEthereumDIDRegistry(registry).setAttribute(address(this), name, value, validity);
    }
}

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
    struct AttributeUpdate {
        bytes32 name;
        bytes value;
        uint256 validity;
    }

    /// @notice Sets a single DID attribute for this identity (the delegating EOA).
    function setAttributeForIdentity(
        address registry,
        bytes32 name,
        bytes calldata value,
        uint256 validity
    ) external {
        IEthereumDIDRegistry(registry).setAttribute(address(this), name, value, validity);
    }

    /// @notice Sets multiple DID attributes in a single transaction.
    /// @dev All updates go to the same registry and are applied to address(this) (the EOA).
    function setBatchAttributesForIdentity(
        address registry,
        AttributeUpdate[] calldata updates
    ) external {
        IEthereumDIDRegistry reg = IEthereumDIDRegistry(registry);
        for (uint256 i = 0; i < updates.length; i++) {
            reg.setAttribute(address(this), updates[i].name, updates[i].value, updates[i].validity);
        }
    }
}

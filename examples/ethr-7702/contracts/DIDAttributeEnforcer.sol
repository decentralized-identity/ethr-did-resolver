// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title DIDAttributeEnforcer
/// @notice MetaMask Delegation Framework caveat enforcer that restricts delegated
///         calls to `EthereumDIDRegistry.setAttribute` where the attribute name
///         starts with a caller-specified 4-byte prefix.
///
///         Integration with MetaMask Delegation Framework:
///           - `terms`  (encoded at delegation time): abi.encode(bytes4 allowedPrefix)
///           - `args`   (runtime, unused): empty
///           - Only `beforeHook` enforces the constraint; the other three hooks are no-ops.
///
///         Execution calldata format (ERC-7579 single-call mode):
///           The DelegationManager passes the packed execution calldata to the enforcer:
///             bytes20  target    — the contract being called (the DID registry)
///             bytes32  value     — ETH value (must be 0)
///             bytes    calldata  — the ABI-encoded function call
///
///         The enforcer:
///           1. Decodes `target` and `calldata` from the packed execution bytes.
///           2. Verifies `calldata` starts with the `setAttribute` selector.
///           3. Decodes the `name` argument (bytes32) from `calldata`.
///           4. Asserts that the first 4 bytes of `name` match `allowedPrefix`.
///
///         This prevents the delegate from writing arbitrary DID attributes — only
///         attributes whose name begins with the approved prefix are permitted.
///
/// @dev  Storage-free: no state variables. All enforcement is pure/stateless.
contract DIDAttributeEnforcer {
    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------

    /// @dev Function selector for EthereumDIDRegistry.setAttribute(address,bytes32,bytes,uint256)
    bytes4 private constant SET_ATTRIBUTE_SELECTOR = bytes4(keccak256("setAttribute(address,bytes32,bytes,uint256)"));

    // -----------------------------------------------------------------------
    // ICaveatEnforcer
    // -----------------------------------------------------------------------

    /// @notice Enforced before the delegated call executes.
    /// @param _terms            ABI-encoded bytes4 prefix that the `name` argument must start with.
    /// @param _executionCalldata Packed ERC-7579 single execution: target(20) ++ value(32) ++ calldata
    function beforeHook(
        bytes calldata _terms,
        bytes calldata, // _args — unused
        bytes32,        // _mode — unused
        bytes calldata _executionCalldata,
        bytes32,        // _delegationHash — unused
        address,        // _delegator — unused
        address         // _redeemer — unused
    ) external pure {
        require(_terms.length == 4, "DIDAttributeEnforcer: invalid terms length");

        bytes4 allowedPrefix = bytes4(_terms[0:4]);

        // ERC-7579 single-execution layout: 20 bytes target + 32 bytes value + calldata
        require(_executionCalldata.length >= 52, "DIDAttributeEnforcer: calldata too short");

        // Skip target (20) and value (32) to get to the inner calldata
        bytes calldata innerCalldata = _executionCalldata[52:];

        require(innerCalldata.length >= 4, "DIDAttributeEnforcer: missing selector");

        bytes4 selector = bytes4(innerCalldata[0:4]);
        require(selector == SET_ATTRIBUTE_SELECTOR, "DIDAttributeEnforcer: not setAttribute");

        // setAttribute(address identity, bytes32 name, bytes value, uint256 validity)
        // After the 4-byte selector: identity(32) + name(32) + ...
        require(innerCalldata.length >= 68, "DIDAttributeEnforcer: calldata too short for name");

        // `name` is the second parameter: offset 4 + 32 (identity padded) = 36
        bytes32 name = bytes32(innerCalldata[36:68]);

        // Check that the first 4 bytes of the name match the allowed prefix
        bytes4 namePrefix = bytes4(name);
        require(namePrefix == allowedPrefix, "DIDAttributeEnforcer: name prefix not allowed");
    }

    /// @notice No-op — no post-call enforcement needed.
    function afterHook(
        bytes calldata,
        bytes calldata,
        bytes32,
        bytes calldata,
        bytes32,
        address,
        address
    ) external pure {} // solhint-disable-line no-empty-blocks

    /// @notice No-op — no pre-batch enforcement needed.
    function beforeAllHook(
        bytes calldata,
        bytes calldata,
        bytes32,
        bytes calldata,
        bytes32,
        address,
        address
    ) external pure {} // solhint-disable-line no-empty-blocks

    /// @notice No-op — no post-batch enforcement needed.
    function afterAllHook(
        bytes calldata,
        bytes calldata,
        bytes32,
        bytes calldata,
        bytes32,
        address,
        address
    ) external pure {} // solhint-disable-line no-empty-blocks
}

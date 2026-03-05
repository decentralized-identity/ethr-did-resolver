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

/// @title TimelockDIDManager7702
/// @notice EIP-7702 delegation contract that introduces a mandatory delay before any
///         DID attribute update takes effect.
///
///         The EOA delegates to this contract and sets a `delay` (seconds). To update
///         a DID attribute it must:
///           1. Call `propose(...)` — queues the update with id = keccak256(args || timestamp)
///           2. Wait `delay` seconds.
///           3. Call `execute(proposalId)` — applies the update to the ERC-1056 registry.
///         The EOA may call `cancel(proposalId)` at any time before execution.
///
///         Storage layout (on the delegating EOA):
///           slot 0  — delay       (uint256)
///           slot 1  — proposals   (mapping(bytes32 => Proposal))
///
/// @dev    Execution can be called by anyone once the delay has elapsed — the EOA
///         only needs to be online for propose() and cancel(). This mirrors governance
///         timelocks (e.g. Compound, OpenZeppelin TimelockController).
contract TimelockDIDManager7702 {
    // -----------------------------------------------------------------------
    // Storage
    // -----------------------------------------------------------------------

    uint256 public delay;

    enum Status { Nonexistent, Queued, Executed, Cancelled }

    struct Proposal {
        address registry;
        bytes32 name;
        bytes   value;
        uint256 validity;
        uint256 eta;      // earliest execution timestamp
        Status  status;
    }

    mapping(bytes32 => Proposal) public proposals;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event Proposed(bytes32 indexed proposalId, uint256 eta);
    event Executed(bytes32 indexed proposalId);
    event Cancelled(bytes32 indexed proposalId);

    // -----------------------------------------------------------------------
    // Configuration
    // -----------------------------------------------------------------------

    /// @notice Set the timelock delay. Only callable by the EOA owner.
    function configure(uint256 _delay) external {
        require(msg.sender == address(this), "only owner");
        delay = _delay;
    }

    // -----------------------------------------------------------------------
    // Timelock lifecycle
    // -----------------------------------------------------------------------

    /// @notice Queue a DID attribute update. Returns the proposal ID.
    ///         Only callable by the EOA owner.
    function propose(
        address registry,
        bytes32 name,
        bytes calldata value,
        uint256 validity
    ) external returns (bytes32 proposalId) {
        require(msg.sender == address(this), "only owner");

        uint256 eta = block.timestamp + delay;
        proposalId = keccak256(abi.encode(registry, name, value, validity, eta));

        require(proposals[proposalId].status == Status.Nonexistent, "duplicate proposal");

        proposals[proposalId] = Proposal({
            registry: registry,
            name:     name,
            value:    value,
            validity: validity,
            eta:      eta,
            status:   Status.Queued
        });

        emit Proposed(proposalId, eta);
    }

    /// @notice Execute a queued proposal after the delay has elapsed.
    ///         Anyone can call this — the EOA only queued it.
    function execute(bytes32 proposalId) external {
        Proposal storage p = proposals[proposalId];
        require(p.status == Status.Queued, "not queued");
        require(block.timestamp >= p.eta, "delay not elapsed");

        p.status = Status.Executed;

        IEthereumDIDRegistry(p.registry).setAttribute(
            address(this), p.name, p.value, p.validity
        );

        emit Executed(proposalId);
    }

    /// @notice Cancel a queued proposal. Only callable by the EOA owner.
    function cancel(bytes32 proposalId) external {
        require(msg.sender == address(this), "only owner");
        Proposal storage p = proposals[proposalId];
        require(p.status == Status.Queued, "not queued");
        p.status = Status.Cancelled;
        emit Cancelled(proposalId);
    }

    // -----------------------------------------------------------------------
    // Views
    // -----------------------------------------------------------------------

    function getProposal(bytes32 proposalId) external view returns (Proposal memory) {
        return proposals[proposalId];
    }
}

# EIP-7702 and did:ethr: New EOA Update Patterns Enabled by Pectra

## Introduction

The Ethereum Pectra hard fork (2025) introduces [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702), which allows externally owned accounts (EOAs) to temporarily set their code to that of a deployed smart contract. This is a subtle but profound change: an EOA can, in a single transaction, delegate execution to a contract *and* use that contract's code to interact with other protocols — all while retaining its identity as the original address.

For the `did:ethr` method, which anchors decentralized identifiers to Ethereum addresses via the [ERC-1056 EthereumDIDRegistry](https://github.com/uport-project/ethr-did-registry), this opens up update patterns that were previously impossible or required deploying a proxy contract. This article explores four such patterns, explains how they work technically, and discusses their security implications.

---

## Background: How did:ethr Updates Work

The ERC-1056 registry maps identities (Ethereum addresses) to DID documents through two mechanisms:

1. **Ownership changes** — `changeOwner(identity, newOwner)` — transfers control to a different key.
2. **Attribute writes** — `setAttribute(identity, name, value, validity)` — appends key material, service endpoints, or other metadata to the DID document. The caller must be the current owner of the identity.

For a plain EOA, updating its own DID document means signing and broadcasting a transaction that calls `setAttribute(eoaAddress, ...)`. This works, but has three structural limitations:

- **Gas**: The EOA must hold ETH to pay for each update.
- **Atomicity**: Setting N attributes requires N separate transactions.
- **Key delegation**: There is no way to let another key update the DID document on the EOA's behalf without first transferring ownership.

EIP-7702 resolves all three.

---

## How EIP-7702 Authorization Works

EIP-7702 introduces a new transaction type (type `0x04`) that carries an `authorizationList`. Each entry is a tuple:

```
authorization = {
  chainId,
  address,   // contract to delegate to
  nonce,
  signature  // signed by the EOA
}
```

When this transaction is processed, the EVM sets the code of the signing EOA to `0xef0100<20-byte-address>` — a delegation designator pointing to the contract. From that point on (until revoked), any call to the EOA address executes the contract's code, but with `address(this)` equal to the EOA's address. Crucially:

- **Storage** slots live on the EOA address.
- **`address(this)`** is the EOA — so calls the code makes to other contracts appear to come from the EOA.
- The delegation can be set and used **in the same transaction**.
- The delegation can be revoked by signing a new authorization pointing to `address(0)`.

For ERC-1056, this means: if the EOA delegates to a contract that calls `IEthereumDIDRegistry.setAttribute(address(this), ...)`, the registry sees the EOA as the caller and updates the DID document — without the EOA needing to hold ETH or sign a direct registry transaction.

---

## The Delegation Contract: DIDManager7702

All patterns use a minimal deployment (`DIDManager7702.sol`) that is deployed once and reused by any EOA:

```solidity
contract DIDManager7702 {
    struct AttributeUpdate {
        bytes32 name;
        bytes value;
        uint256 validity;
    }

    function setAttributeForIdentity(
        address registry, bytes32 name, bytes calldata value, uint256 validity
    ) external {
        IEthereumDIDRegistry(registry).setAttribute(address(this), name, value, validity);
    }

    function setBatchAttributesForIdentity(
        address registry, AttributeUpdate[] calldata updates
    ) external {
        IEthereumDIDRegistry reg = IEthereumDIDRegistry(registry);
        for (uint256 i = 0; i < updates.length; i++) {
            reg.setAttribute(address(this), updates[i].name, updates[i].value, updates[i].validity);
        }
    }
}
```

The key insight: `address(this)` at execution time equals the delegating EOA's address, so every `setAttribute` call authenticates as the EOA.

---

## Pattern 0: Simple EOA Self-Update

**Scenario**: An EOA wants to add a new key to its DID document in the simplest possible way.

**Flow**:
1. EOA signs a 7702 authorization tuple designating `DIDManager7702` as the implementation, with `executor: self` (the EOA is also the transaction sender).
2. EOA broadcasts a type-4 transaction that contains:
   - The authorization list (sets the delegation).
   - A call to `setAttributeForIdentity(registry, name, value, validity)` on itself.
3. The EVM applies the delegation, then executes the call. `setAttribute` in ERC-1056 records the attribute.
4. The resolver picks up the `DIDAttributeChanged` event and includes the new key in the DID document.

**Code** (`src/patterns/simple-update.ts`):

```typescript
const authorization = await eoaWalletClient.signAuthorization({
  contractAddress: didManagerAddress,
  executor: 'self',
})

const hash = await eoaWalletClient.sendTransaction({
  authorizationList: [authorization],
  to: eoaAddress,     // call the EOA itself
  data: encodeFunctionData({ abi: DID_MANAGER_ABI, functionName: 'setAttributeForIdentity', args: [...] }),
})
```

**What changes vs. a plain EOA call**: Nothing observable on-chain — the DID document update is identical. The difference is the delegation code (`0xef0100...`) is now set on the EOA. This can be cleared by a later authorization to `address(0)`.

**Security note**: Pattern 0 has no access control by design — the EOA is the transaction sender, so no other party can invoke the delegation. EIP-7702 does not inherently improve security; it simply shifts where authorization is enforced. Once an EOA delegates to a contract that calls `setAttribute(address(this), ...)`, anyone who can call that function can update the DID document on the EOA's behalf. For patterns where a third party (relayer) sends the transaction, explicit on-chain authorization is required. Pattern 1a introduces `MetaTxDIDManager7702`, which adds EIP-712 typed-data signatures so the EOA authorizes each specific update — the relayer can submit it but cannot forge or alter the content.

---

## Pattern 1: Batched DID Updates

**Scenario**: An EOA needs to rotate its key set — replacing an old Ed25519 key with a new one and adding a Secp256k1 recovery key. Previously this required two transactions.

**Flow**:
1. Same 7702 authorization as Pattern 0.
2. A single type-4 transaction calls `setBatchAttributesForIdentity` with an array of `AttributeUpdate` structs.
3. All attributes are set in one EVM execution — atomically. Either all succeed or all revert.

**Code** (`src/patterns/batched-updates.ts`):

```typescript
const hash = await eoaWalletClient.sendTransaction({
  authorizationList: [authorization],
  to: eoaAddress,
  data: encodeFunctionData({
    abi: DID_MANAGER_ABI,
    functionName: 'setBatchAttributesForIdentity',
    args: [registry, updates],  // updates: array of {name, value, validity}
  }),
})
```

**Why this matters**: Atomic multi-attribute updates prevent inconsistent DID document states. A DID document mid-rotation (old key revoked but new key not yet added) creates a window where authentication is impossible. Batching eliminates this.

**Gas savings**: One transaction's fixed overhead (21,000 gas + EIP-7702 processing) instead of N. For 5 attribute updates, this saves roughly 80,000–100,000 gas.

---

## Pattern 2: Gasless / Sponsored Updates

**Scenario**: A user with a fresh EOA wants to register DID attributes but holds no ETH. A relayer (sponsor) is willing to pay gas.

**Flow**:
1. EOA signs a 7702 authorization designating `DIDManager7702` AND specifying the sponsor's address as `executor`.
2. The EOA shares the signed authorization with the sponsor (off-chain — no transaction needed).
3. The sponsor broadcasts a type-4 transaction containing:
   - The EOA's authorization tuple.
   - A call to `setAttributeForIdentity` targeting the EOA's address.
4. The EVM: sets the delegation on the EOA, executes the call as if called from the EOA.

**Code** (`src/patterns/gasless-updates.ts`):

```typescript
// EOA signs — no ETH required
const authorization = await eoaWalletClient.signAuthorization({
  contractAddress: didManagerAddress,
  executor: sponsorAddress,   // ← key difference from Pattern 0
})

// Sponsor broadcasts and pays gas
const hash = await sponsorWalletClient.sendTransaction({
  authorizationList: [authorization],
  to: eoaAddress,
  data: encodeFunctionData({ ... }),
})
```

**Security note**: The authorization tuple is specific to:
- The chain ID (prevents replay on other chains).
- The nonce at signing time (prevents replay after the nonce advances).
- The contract address (prevents bait-and-switch to a malicious contract).

**What changes vs. meta-transactions (EIP-2771)**: No need for a trusted forwarder contract or a registry. The sponsor relationship is ephemeral and cryptographically bound to a specific operation.

---

## Pattern 3: Policy-Enforced Updates via Session Keys

**Scenario**: An organization operates a key management service. Instead of storing the user's main private key, it holds a *session key* — a short-lived key that can perform DID updates within well-defined limits. If the session key is compromised, the blast radius is bounded.

**The PolicyDIDManager7702 contract**:

```solidity
contract PolicyDIDManager7702 {
    address public sessionKey;
    uint256 public maxValidity;
    bytes32 public allowedPrefix;

    // Only the EOA owner can configure the policy
    function configure(address _sessionKey, uint256 _maxValidity, bytes32 _allowedPrefix) external {
        require(msg.sender == address(this), "only owner");
        sessionKey = _sessionKey;
        maxValidity = _maxValidity;
        allowedPrefix = _allowedPrefix;
    }

    // Session key entrypoint — enforces policy
    function setAttributeViaSessionKey(address registry, bytes32 name, bytes calldata value, uint256 validity) external {
        require(msg.sender == sessionKey, "not session key");
        require(validity <= maxValidity, "validity exceeds cap");
        require(_hasPrefix(name, allowedPrefix), "name prefix not allowed");
        IEthereumDIDRegistry(registry).setAttribute(address(this), name, value, validity);
    }
}
```

**Flow**:
1. EOA signs a 7702 authorization pointing to `PolicyDIDManager7702`.
2. EOA sends a type-4 tx that: (a) sets the delegation, (b) calls `configure(sessionKeyAddress, 3600, "did/pub/")`.
   - The `configure` call sets storage on the EOA's address. Future calls to the EOA will see these values.
3. The session key (held by the key management service) can now call `setAttributeViaSessionKey` on the EOA directly, with zero EOA involvement, subject to:
   - Only `did/pub/*` attributes can be set (service endpoints, for example, cannot be set).
   - No attribute can have a validity longer than 1 hour.
   - Only the registered session key can call this function.

**Code** (`src/patterns/policy-enforced.ts`):

```typescript
// Step 1+2: EOA configures in one tx
await configurePolicyDelegation(eoaWalletClient, publicClient, {
  policyDidManagerAddress: contracts.policyDidManager,
  sessionKey: sessionKeyAddress,
  maxValidity: 3600n,
  allowedPrefix: '0x6469642f7075622f000...',  // "did/pub/" as bytes32
})

// Step 3: Session key updates independently
await sessionKeyDidUpdate(sessionKeyWalletClient, publicClient, {
  registry: contracts.registry,
  policyDidManagerAddress: contracts.policyDidManager,
  eoaAddress,
  attrName: stringToBytes32('did/pub/Ed25519/veriKey/base64'),
  attrValue: new TextEncoder().encode(publicKeyMaterial),
  validity: 1800n,
})
```

**Key insight — storage persistence**: Because EIP-7702 stores data in the EOA's own storage slots, the policy configuration persists after the initial setup transaction. The EOA does not need to be involved in subsequent session key updates.

---

## Does did:ethr Require Changes?

**No.** The resolver and the ERC-1056 registry are completely unaware of EIP-7702. From their perspective, `setAttribute` was called by the EOA's address — which is true, since `address(this)` in the delegation context equals the EOA. The `DIDAttributeChanged` event is emitted with `identity = eoaAddress`, the resolver indexes it, and the DID document is updated identically to a direct EOA call.

The `did:ethr` DID document format (`did:ethr:<network>:<address>`) remains unchanged. The DID string itself does not encode whether the controlling EOA uses 7702 delegation.

The only observable difference on-chain is that the EOA now has code (`0xef0100<contract-address>`). This is invisible to the resolver.

---

## Security Implications

### Authorization Replay
A signed 7702 authorization tuple is bound to `(chainId, contractAddress, nonce)`. Once the EOA's nonce advances past the signed nonce, the authorization is permanently invalid. This provides a natural expiry mechanism.

**Risk**: If an authorization is used (nonce advances), the authorization cannot be replayed. However, if the nonce at signing time is still valid and the authorization is intercepted before use, it can be replayed once. **Mitigation**: Treat signed authorization tuples as secrets until they are broadcast.

### Revocation
The EOA can revoke a delegation at any time by signing a new authorization with `contractAddress: address(0)` and including it in a transaction. This is instant and irreversible (until a new delegation is set).

For session keys (Pattern 3): revocation of the session key is done by the EOA calling `configure(newKey, ...)` or by revoking the entire delegation. The session key itself cannot revoke itself.

### Reentrancy
`DIDManager7702.setAttributeForIdentity` calls an external contract (`IEthereumDIDRegistry`). If the registry were malicious or upgradeable to a malicious implementation, it could reenter the delegation contract. However, the ERC-1056 registry is a non-upgradeable, well-audited contract, so this is not a practical risk in the standard deployment.

`PolicyDIDManager7702` has the same call pattern. The `configure` function writes storage before any external call, so there is no reentrancy concern there either.

### Policy Bypass via Re-delegation
An attacker who compromises the EOA's private key could re-delegate to a different (unrestricted) contract and bypass the policy entirely. The session key policy only restricts what the *session key* can do — the EOA itself retains full control.

This is by design: EIP-7702 is an EOA capability, not a restriction mechanism on the EOA. If you need to constrain the EOA itself, a Safe multisig or similar remains the appropriate tool.

### Storage Slot Collisions
If an EOA delegates to a contract that uses storage, and later re-delegates to a different contract, the second contract may read stale values from slots the first contract wrote. Both `DIDManager7702` (no storage) and `PolicyDIDManager7702` (uses slots 0–2) are designed with this in mind. Always audit storage layout when switching delegation contracts.

---

## Summary

| Pattern | Gas Payer | Attributes/Tx | Key Constraint | EOA Involvement |
|---------|-----------|---------------|----------------|-----------------|
| 0 — Simple | EOA | 1 | None | Per update |
| 1 — Batched | EOA | N (atomic) | None | Per batch |
| 2 — Gasless | Sponsor | 1 | Sponsor-bound auth | Sign once (off-chain) |
| 3 — Session Key | Session key | 1 (with policy) | Prefix + validity cap | Configure once |

EIP-7702 does not change the `did:ethr` data model or require any resolver updates. What it changes is the *operational surface* available to EOA holders: gas sponsorship, atomic batching, and constrained key delegation all become possible without any registry upgrade or proxy deployment.

---

## Running the Examples

```bash
# Prerequisites: Foundry (for Anvil), pnpm
pnpm install
pnpm test
```

All four patterns are tested against a local Anvil node running the Prague hardfork, with the ERC-1056 registry and both delegation contracts deployed. Tests use `vitest` with per-test Anvil snapshot/revert for isolation.

See `src/patterns/` for the TypeScript implementations and `contracts/` for the Solidity delegation contracts.

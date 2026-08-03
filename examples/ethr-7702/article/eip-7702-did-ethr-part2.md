# EIP-7702 and did:ethr Part 2: Advanced Patterns and Production Hardening

## Introduction

[Part 1](./eip-7702-did-ethr.md) covered the foundational EIP-7702 delegation patterns for `did:ethr`: simple self-updates, batched attribute writes, gasless sponsorship, and policy-enforced session keys. This article goes further — three advanced patterns that address real production requirements, followed by a production hardening guide covering gas optimization, storage safety, authorization tuple lifecycle, and key compromise response.

All patterns are tested against an Anvil Prague hardfork node. Code lives in `src/patterns/` and `contracts/`.

---

## Recap: The Delegation Model

When an EOA includes a 7702 authorization tuple in a type-4 transaction, the EVM sets the EOA's code to `0xef0100<contract-address>`. Calls to the EOA then execute the contract's logic, but with `address(this)` equal to the EOA's own address. Storage writes go to the EOA's storage. ERC-1056 sees `msg.sender == EOA address`.

All four new patterns build on this — each contract in `contracts/` is deployed once and can be reused by any EOA that delegates to it.

---

## Pattern 4: M-of-N Multi-Sig DID Updates

**Scenario**: A corporate DID should require two out of three officers to approve any key rotation. No single private key should be able to unilaterally update the DID document.

### Contract: MultiSigDIDManager7702

```solidity
contract MultiSigDIDManager7702 {
    address[] public signers;   // registered co-signers (in EOA storage)
    uint256 public threshold;   // M required
    uint256 public nonce;       // replay protection

    function configure(address[] calldata _signers, uint256 _threshold) external {
        require(msg.sender == address(this), "only owner");
        require(_threshold >= 1 && _threshold <= _signers.length, "invalid threshold");
        delete signers;
        for (uint256 i = 0; i < _signers.length; i++) signers.push(_signers[i]);
        threshold = _threshold;
    }

    function setAttributeWithMultiSig(
        address registry, bytes32 name, bytes calldata value, uint256 validity,
        bytes[] calldata sigs   // exactly threshold signatures, sorted by signer address
    ) external {
        require(sigs.length >= threshold, "not enough signatures");
        bytes32 digest = _updateDigest(registry, name, value, validity, nonce);

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
}
```

The digest co-signers sign:

```solidity
keccak256(abi.encodePacked(
    "\x19Ethereum Signed Message:\n32",
    keccak256(abi.encode(address(this), registry, name, value, validity, nonce))
))
```

Binding the digest to `address(this)` (the EOA), the registry, and the current nonce means signatures cannot be replayed for a different identity, a different attribute, or after a previous update has consumed the nonce.

### TypeScript Flow

```typescript
// Step 1: EOA sets delegation + configures signer set
await configureMultiSigDelegation(eoaWalletClient, publicClient, {
  multiSigDidManagerAddress: contracts.multiSigDidManager,
  signers: [signerA.address, signerB.address, signerC.address],
  threshold: 2n,
})

// Step 2 (off-chain): each co-signer fetches the digest and signs it
const digest = await publicClient.readContract({
  address: eoaAddress,
  abi: MULTISIG_DID_MANAGER_ABI,
  functionName: 'updateDigest',
  args: [registry, attrName, attrValue, validity, currentNonce],
})

// account.sign({hash}) signs the raw hash — the digest already
// includes the EIP-191 prefix, so signMessage would double-prefix
const sigA = await signerAAccount.sign({ hash: digest })
const sigB = await signerBAccount.sign({ hash: digest })

// Step 3: anyone submits with threshold-many signatures (sorted by address)
await setAttributeWithMultiSig(anyWalletClient, publicClient, {
  registry, eoaAddress, attrName, attrValue, validity,
  signatures: [sigA, sigB].sort(/* by recovered address */),
})
```

**Important**: use `account.sign({ hash })` not `signMessage`. The digest already contains the `\x19Ethereum Signed Message:\n32` prefix. Using `signMessage` would double-prefix, causing `ecrecover` to recover the wrong signer address.

### Security Properties

- **No unilateral control**: threshold > 1 means no single key compromise enables a DID update.
- **Duplicate prevention**: the sorted-address check (`recovered > prev`) prevents submitting the same signature twice.
- **Replay protection**: nonce increments per update; same signature is invalid on the next update.
- **Open submission**: once M signatures are collected, *anyone* can submit the transaction. The EOA need not be online.

---

## Pattern 5: Revocation Registry Integration

**Scenario**: An issuer EOA needs to provide two revocation mechanisms: (1) ERC-1056 key expiry (set `validTo = 0` on an attribute) and (2) credential-level revocation — a per-credential boolean that verifiers can query on-chain without resolving the full DID document.

### Contract: RevocationDIDManager7702

```solidity
contract RevocationDIDManager7702 {
    mapping(bytes32 => bool) public revocations; // stored on EOA

    function setAttributeForIdentity(address registry, bytes32 name, bytes calldata value, uint256 validity) external {
        require(msg.sender == address(this), "only owner");
        IEthereumDIDRegistry(registry).setAttribute(address(this), name, value, validity);
    }

    // ERC-1056 revocation: sets validTo=0 in the registry
    function revokeAttributeForIdentity(address registry, bytes32 name, bytes calldata value) external {
        require(msg.sender == address(this), "only owner");
        IEthereumDIDRegistry(registry).revokeAttribute(address(this), name, value);
    }

    // Credential revocation: stored in EOA storage, queryable by verifiers
    function revokeCredential(bytes32 credentialId) external {
        require(msg.sender == address(this), "only owner");
        revocations[credentialId] = true;
        emit CredentialRevoked(credentialId, block.timestamp);
    }

    function isRevoked(bytes32 credentialId) external view returns (bool) {
        return revocations[credentialId];
    }
}
```

### TypeScript Flow

```typescript
// Delegation + initial attribute in one tx (avoids no-op delegation revert)
await setupRevocationDelegation(eoaWalletClient, publicClient, {
  revocationDidManagerAddress: contracts.revocationDidManager,
  registry, attrName, attrValue, validity,
})

// Revoke the DID attribute (ERC-1056 path)
await revokeAttribute(eoaWalletClient, publicClient, { registry, attrName, attrValue })

// Revoke a credential by its ID
const credentialId = keccak256(new TextEncoder().encode('vc:example:abc123'))
await revokeCredential(eoaWalletClient, publicClient, { credentialId })

// Anyone can check revocation status on-chain
const isRevoked = await checkIsRevoked(publicClient, { eoaAddress, credentialId })
```

### Two Revocation Channels

| Channel | Where stored | Who queries | Granularity |
|---------|-------------|-------------|-------------|
| ERC-1056 `revokeAttribute` | Registry contract (event log) | DID resolver | Per attribute |
| `revokeCredential` | EOA storage (mapping) | Direct `eth_call` | Per credential |

The ERC-1056 path is resolver-visible: after `revokeAttribute`, the `did:ethr` resolver excludes the key from the DID document. The credential path is resolver-invisible: it targets individual issued credentials independently of the DID document state. Verifiers should check both channels.

### Security Properties

- **Owner-only writes**: all write functions require `msg.sender == address(this)` — only the EOA can revoke.
- **No un-revoke**: `revocations[credentialId]` can be set to `true` but never back to `false` — revocation is permanent.
- **EOA storage as registry**: because the revocation mapping lives on the EOA's address, any smart contract or off-chain verifier can read it at `eoaAddress.isRevoked(credentialId)` as long as the delegation is still set.

---

## Pattern 6: Cross-Chain DID Sync

**Scenario**: An EOA's DID document exists on Ethereum mainnet. The same identity needs to be usable on an L2 or sidechain where the EOA has no ETH. A relayer on the target chain should be able to propagate signed DID updates from the EOA without requiring the EOA to bridge ETH or hold any native token on the target chain.

This is the most complete demonstration of EIP-7702's off-chain signing model: the EOA never sends a transaction. At all.

### The Authorization Challenge

Pattern 2 (gasless) uses `executor: sponsorAddress` — the sponsor sends the type-4 tx, which includes the EOA's auth tuple. Pattern 7 does the same, but the authorization is signed with the explicit relayer address as executor:

```typescript
// executor: relayerAddress — NOT 'self'
const authorization = await eoaWalletClient.signAuthorization({
  contractAddress: crossChainDidManagerAddress,
  executor: relayerAddress,   // ← critical
})
```

Why not `executor: 'self'`? viem's `prepareAuthorization` increments the EOA's pending nonce by 1 when `executor === 'self'`, because it assumes the EOA will be sending the tx and consuming its own nonce. When the relayer sends the tx instead, the EOA's nonce is NOT consumed — the auth tuple contains the wrong nonce, Ethereum silently ignores it, and no delegation is set.

### Contract: CrossChainDIDManager7702

The contract uses EIP-712 typed signatures for update authorization. The domain binds the signature to a specific chain and the specific EOA (as `verifyingContract`), preventing replay across chains or identities:

```solidity
contract CrossChainDIDManager7702 {
    uint256 public crossChainNonce;

    bytes32 private constant UPDATE_AUTH_TYPE_HASH = keccak256(
        "UpdateAuthorization(address registry,bytes32 name,bytes value,uint256 validity,uint256 nonce)"
    );

    function setAttributeCrossChain(
        address registry, bytes32 name, bytes calldata value,
        uint256 validity, bytes calldata signature
    ) external {
        bytes32 structHash = keccak256(abi.encode(
            UPDATE_AUTH_TYPE_HASH, registry, name, keccak256(value), validity, crossChainNonce
        ));
        bytes32 domainSeparator = keccak256(abi.encode(
            DOMAIN_TYPE_HASH,
            keccak256("CrossChainDIDManager7702"),
            keccak256("1"),
            block.chainid,           // chain-specific
            address(this)            // == EOA at call time
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));

        address recovered = _recoverSigner(digest, signature);
        require(recovered == address(this), "invalid signature"); // address(this) == EOA

        crossChainNonce++;
        IEthereumDIDRegistry(registry).setAttribute(address(this), name, value, validity);
    }
}
```

### TypeScript Flow

```typescript
// Step 1 (off-chain): EOA signs EIP-7702 auth tuple — no tx, no ETH
const authorization = await signCrossChainAuthorization(eoaWalletClient, {
  crossChainDidManagerAddress: contracts.crossChainDidManager,
  relayerAddress: relayerAccount.address,  // executor = relayer
})

// Step 2 (off-chain): EOA signs EIP-712 update authorization — no tx
const signature = await signCrossChainUpdate(eoaWalletClient, {
  eoaAddress,
  registry: contracts.registry,
  attrName, attrValue, validity,
  nonce: 0n,
  chainId,  // must match the target chain — prevents cross-chain replay
})

// Step 3: Relayer submits ONE tx: sets delegation + calls setAttributeCrossChain
// The EOA has spent zero gas and sent zero transactions on this chain
await relayerSubmitUpdate(relayerWalletClient, publicClient, {
  registry: contracts.registry,
  eoaAddress, attrName, attrValue, validity, signature,
  authorization,  // atomic: delegation set + update in same tx
})
```

### Replay Protection — Two Layers

| Layer | Mechanism | Scope |
|-------|-----------|-------|
| EIP-7702 auth nonce | EOA account nonce at signing time | Per delegation |
| EIP-712 update nonce | `crossChainNonce` in EOA storage | Per update |
| Chain binding | `chainId` in EIP-712 domain | Cross-chain replay |
| Identity binding | `verifyingContract = EOA address` in EIP-712 domain | Cross-identity replay |

---

## Production Hardening

### Gas Optimization

**Baseline costs** (measured on Anvil Prague, approximate):

| Operation | Gas |
|-----------|-----|
| Type-4 tx overhead (with auth list) | ~21,000 + ~2,500/auth |
| `setAttribute` (ERC-1056) | ~45,000–55,000 |
| `MultiSigDIDManager7702.configure` (3 signers) | ~80,000 |
| `setAttributeWithMultiSig` (2-of-3) | ~75,000 |
| `revokeCredential` (first time, cold storage) | ~45,000 |
| `setAttributeCrossChain` (with delegation) | ~80,000 |

**Optimization opportunities**:

1. **Batch configure + first action**: All patterns that need an initial configuration call combine delegation + configure in a single type-4 tx, saving one transaction's base cost (~21,000 gas).

2. **`bytes` vs `bytes32` for attribute values**: ERC-1056 stores attribute values as `bytes` (dynamic). Short values (≤32 bytes) cost the same as a `bytes32` slot. For values over 32 bytes, consider IPFS/Arweave for content and store only the hash as the attribute value.

3. **Multi-sig signature ordering**: The ascending-address sort requirement in `setAttributeWithMultiSig` means submitters need to collect and sort signatures off-chain. This is zero cost on-chain but adds off-chain coordination complexity. For 2-of-N with N≤5, the sort can be done in O(N) off-chain.

4. **Timelock storage**: The `Proposal` struct stores the full `value` bytes in EOA storage. For large values, consider storing only `keccak256(value)` in the proposal and passing the value again at execution time, verifying the hash. This trades re-submission cost for storage savings.

5. **crossChainNonce vs per-operation nonce**: The cross-chain contract uses a single sequential nonce. If you need to pre-sign multiple updates without waiting for confirmation, consider a bitmap nonce (like EIP-4337 `UserOperation.nonce`) to allow out-of-order execution.

### Re-entrancy and Storage Collision Audit

**Re-entrancy**: All write functions in all four contracts follow checks-effects-interactions:
- State is updated (`nonce++`, `p.status = Executed`) *before* the external `setAttribute` call.
- ERC-1056 is a non-upgradeable, audited contract with no callbacks. Practical re-entrancy risk is negligible.
- If you deploy against an unknown or upgradeable registry, add a `nonReentrant` guard.

**Storage collision between delegation contracts**: because delegated code runs in the EOA's storage, every stateful manager must anchor its state at a distinct slot. Each manager now uses ERC-7201-style namespaced storage — a struct anchored at `keccak256("ethr-7702.<ContractName>")`:

| Contract | Namespaced base slot | Layout from base |
|----------|----------------------|------------------|
| MultiSigDIDManager7702 | `keccak256("ethr-7702.MultiSigDIDManager7702")` | `+0` `signers[]`, `+1` `threshold`, `+2` `nonce` |
| RevocationDIDManager7702 | `keccak256("ethr-7702.RevocationDIDManager7702")` | `+0` `revocations` mapping |
| CrossChainDIDManager7702 | `keccak256("ethr-7702.CrossChainDIDManager7702")` | `+0` `crossChainNonce` |
| PolicyDIDManager7702 (Part 1) | `keccak256("ethr-7702.PolicyDIDManager7702")` | `+0` `sessionKey`, `+1` `maxValidity`, `+2` `allowedPrefix` |
| MetaTxDIDManager7702 | `keccak256("ethr-7702.MetaTxDIDManager7702")` | `+0` `nonce` |
| ExpiringDIDManager7702 | `keccak256("ethr-7702.ExpiringDIDManager7702")` | `+0` `expiry` |

**Why namespaced slots matter**: the slot is derived from the contract name, so two different managers can never overlap even when a single EOA re-delegates between them. Before this fix, all stateful managers wrote slots 0/1/2 — re-delegating a policy-configured EOA to MultiSig made `delete signers` read the stale `sessionKey` address as the array length and revert out-of-gas. With distinct keccak-derived bases, re-delegation is collision-free: each manager reads/writes only its own region, and `configure` re-initializes exactly that region.

**Rule**: any new stateful delegation contract must anchor its storage at a unique `keccak256(...)` namespace (and mirror the exact slot math off-chain when reading state with `getStorageAt`).

### Authorization Tuple Lifecycle

An EIP-7702 authorization tuple is bound to `(chainId, contractAddress, nonce)`. Understanding its lifecycle is essential for security:

**Valid states**:

```
[signed] → [broadcasted in tx] → [processed: delegation set]
                                       ↓
                               [EOA nonce advances]
                                       ↓
                          [tuple is now permanently stale]
```

**Revocation flows**:

1. **Immediate revocation**: send a new type-4 tx with `contractAddress: address(0)`. This sets EOA code to `0xef010000...0000` (empty delegation). Gas cost: ~25,000.
2. **Nonce-based expiry**: if an authorization is signed but not yet used, sending any other transaction from the EOA increments the nonce and permanently invalidates the outstanding auth tuple.
3. **Re-delegation**: send a new type-4 tx pointing to a different contract. This overwrites the delegation designator atomically.

**Auth tuple security rules**:
- Treat a signed auth tuple as a bearer credential — it authorizes anyone who holds it to set your delegation (once, to the specified contract).
- Never sign auth tuples with `nonce = 0` on mainnet unless you intend to immediately use them. An attacker who intercepts a nonce-0 auth can wait for the right moment.
- For gasless patterns: sign the auth tuple immediately before the relayer submits it, minimizing the window in which it is valid but unused.
- Use chain-specific auth tuples (always include `chainId`). viem includes `chainId` by default.

**Nonce management for relayer patterns**: When the relayer sends the type-4 tx, the relayer's nonce is consumed (not the EOA's). The EOA auth tuple is keyed to the EOA's nonce. If multiple auth tuples are pre-signed for the same EOA at different nonces, they can each be used exactly once — but be careful: using auth at nonce N also invalidates any auth signed at nonce < N (since the EOA's nonce is now > N).

### Key Compromise Response Playbook

The following procedures assume the production setup from these patterns.

#### Scenario A: Session Key Compromised (Pattern 3 / Policy-Enforced)

**Impact**: An attacker can call `setAttributeViaSessionKey` with any `did/pub/*` attribute, validity ≤ `maxValidity`.

**Response**:
1. From the EOA, call `configure(address(0), 0, 0x0)` — clears the session key immediately. Gas: ~30,000.
2. Optionally: send a new type-4 tx to re-delegate to `address(0)` to fully remove delegation.
3. Audit the ERC-1056 registry for fraudulent `DIDAttributeChanged` events on the EOA's address since the compromise time.
4. For each fraudulent attribute: call `revokeAttribute` (via `RevocationDIDManager7702`) to set `validTo = 0`.

**Time to contain**: 1 transaction (no waiting).

#### Scenario B: Multi-Sig Quorum Compromised (Pattern 4)

**Impact**: M-of-N signers are compromised. Attacker can submit valid DID updates.

**Response**:
1. From any remaining honest signers, determine if a quorum of honest signers still exists.
2. If yes: call `configure([newSigners], newThreshold)` from the EOA to replace the compromised keys.
3. If no honest quorum remains: the EOA must act directly — send a type-4 tx that re-delegates to a simple `DIDManager7702` or to `address(0)`, bypassing the multi-sig entirely. The EOA private key takes precedence over the multi-sig contract logic.
4. Revoke any fraudulent attributes as in Scenario A.

**Key insight**: the EOA private key can always override the delegation. The 7702 contract is a capability layer, not a restriction on the EOA itself.

#### Scenario C: EOA Private Key Compromised

**Impact**: Total control. Attacker can change delegation, update DID attributes, revoke credentials, drain ETH.

**Response**:
1. This is an identity theft scenario — the DID has no cryptographic path to recovery without the key.
2. Mitigation path: if the DID was `changeOwner`-transferred to a different address (ERC-1056), the new owner can update the DID document.
3. Social recovery: out-of-band, publish a revocation notice and instruct verifiers to distrust the compromised DID.
4. For new identity: register a new `did:ethr` with a fresh key, re-issue credentials under the new DID.

**Preventive measure**: for high-value EOA identities, use a multisig wallet (Safe or similar) as the DID controller address from the start, so no single key has unilateral authority.

---

## Summary Table

| Pattern | Contract | Gas Payer | Key Feature | EOA online? |
|---------|----------|-----------|-------------|-------------|
| 4 — Multi-sig | MultiSigDIDManager7702 | Submitter (anyone) | M-of-N approval | Configure only |
| 5 — Revocation | RevocationDIDManager7702 | EOA | ERC-1056 + credential revocation | Per revocation |
| 6 — Cross-chain | CrossChainDIDManager7702 | Relayer (always) | EOA has zero ETH on target chain | Never |

---

## Running the Examples

```bash
pnpm install
pnpm test
```

All tests pass against a local Anvil Prague hardfork node.

| File | Tests | Pattern |
|------|-------|---------|
| `test/infrastructure.test.ts` | 2 | Registry deployment |
| `test/simple-update.test.ts` | 1 | Pattern 0 |
| `test/batched-updates.test.ts` | 1 | Pattern 1 |
| `test/gasless-updates.test.ts` | 1 | Pattern 2 |
| `test/policy-enforced.test.ts` | 3 | Pattern 3 |
| `test/multisig-updates.test.ts` | 3 | Pattern 4 |
| `test/revocation.test.ts` | 3 | Pattern 5 |
| `test/cross-chain-sync.test.ts` | 3 | Pattern 6 |

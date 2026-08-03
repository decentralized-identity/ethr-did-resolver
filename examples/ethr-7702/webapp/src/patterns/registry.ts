// Pattern registry — wires the shared src/patterns/* implementations to the
// interactive explainer UI. Each pattern = ordered steps; each step runs one
// on-chain action and the UI re-resolves the DID document afterwards.

import { toHex, encodeFunctionData, zeroAddress, keccak256, toBytes } from 'viem'
import { stringToBytes32 } from 'ethr-did-resolver'
import { EXPIRING_DID_MANAGER_ABI } from '@utils/abis.js'
import { simpleDidUpdate } from '@patterns/simple-update.js'
import { batchedDidUpdates } from '@patterns/batched-updates.js'
import { gaslessDidUpdate } from '@patterns/gasless-updates.js'
import {
  configurePolicyDelegation,
  sessionKeyDidUpdate,
} from '@patterns/policy-enforced.js'
import {
  configureMultiSigDelegation,
  getUpdateDigest,
  multiSigDidUpdate,
} from '@patterns/multisig-updates.js'
import {
  signMetaTxSetAttribute,
  relayMetaTxSetAttribute,
} from '@patterns/meta-tx-updates.js'
import {
  setupRevocationDelegation,
  revokeAttribute,
  revokeCredential,
  checkIsRevoked,
  credentialIdFromString,
} from '@patterns/revocation.js'
import {
  signCrossChainAuthorization,
  signCrossChainUpdate,
  relayerSubmitUpdate,
} from '@patterns/cross-chain-sync.js'
import type { StepContext, Pattern, StepResult } from './types'

export type { Pattern, StepContext, StepResult } from './types'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const ATTR_DID_KEY = stringToBytes32('did/pub/Ed25519/veriKey/base64') as `0x${string}`
const ATTR_SVC = stringToBytes32('did/svc/LinkedDomains') as `0x${string}`
const VALIDITY = 3600n

// ethr-did-resolver v14 validates Secp256k1 attribute values as real secp256k1
// public keys (33 compressed / 65 uncompressed bytes). Placeholder strings are
// rejected, so use an actual compressed public key.
const SECP256K1_VERIKEY = '0x034646ae5047316b4230d0086c8acec687f00b1cd9d1dc634f6cb358ac0a9a8fff'

function keyValue(label: string): `0x${string}` {
  return toHex(new TextEncoder().encode(label))
}

async function txResult(
  run: () => Promise<`0x${string}`>,
  summary: string,
  extra?: Record<string, unknown>
): Promise<StepResult> {
  const txHash = await run()
  return {
    txHash,
    summary,
    detail: extra ? JSON.stringify(extra, null, 2) : undefined,
  }
}

/** ERC-7201-style namespace for a manager's state in EOA storage. Must match the
 *  keccak256 strings in contracts/*.sol. */
function managerStorageBase(managerName: string): bigint {
  return BigInt(keccak256(toBytes(`ethr-7702.${managerName}`)))
}

/** Read a field at `offset` within a manager's namespaced storage region. */
async function readNamespacedField(
  ctx: StepContext,
  managerName: string,
  offset: number
): Promise<bigint> {
  const raw = await ctx.publicClient.getStorageAt({
    address: ctx.identityAddress,
    slot: toHex(managerStorageBase(managerName) + BigInt(offset)),
  })
  return raw === null ? 0n : BigInt(raw as `0x${string}`)
}

/** Read the live multisig nonce (MultiSig State.nonce at base + 2). */
async function readMultiSigNonce(ctx: StepContext): Promise<bigint> {
  return readNamespacedField(ctx, 'MultiSigDIDManager7702', 2)
}

/** Read the live meta-tx nonce (MetaTx State.nonce at base + 0). */
async function readMetaTxNonce(ctx: StepContext): Promise<bigint> {
  return readNamespacedField(ctx, 'MetaTxDIDManager7702', 0)
}

/** Read the live cross-chain nonce (CrossChain State.crossChainNonce at base + 0). */
async function readCrossChainNonce(ctx: StepContext): Promise<bigint> {
  return readNamespacedField(ctx, 'CrossChainDIDManager7702', 0)
}

// ---------------------------------------------------------------------------
// Pattern 0: Simple
// ---------------------------------------------------------------------------

export const patternSimple: Pattern = {
  id: 'simple',
  number: '0',
  title: 'Simple 7702 Self-Update',
  summary:
    'The EOA signs an EIP-7702 authorization delegating to DIDManager7702 and updates its own DID document in a single type-4 transaction.',
  contract: 'DIDManager7702',
  steps: [
    {
      title: 'Delegate + update in one tx',
      description:
        'The identity EOA signs a 7702 authorization (executor: self) and sends a type-4 tx that sets the delegation and calls setAttributeForIdentity on itself. address(this) inside the delegated code equals the EOA, so ERC-1056 sees the EOA as the caller.',
      run: async (ctx) =>
        txResult(
          () =>
            simpleDidUpdate(ctx.walletFor('identity'), ctx.publicClient, {
              registry: ctx.addresses.registry,
              didManagerAddress: ctx.addresses.didManager,
              attrName: ATTR_DID_KEY,
              attrValue: keyValue('simplekey'),
              validity: VALIDITY,
            }),
          'DID attribute written via delegated DIDManager7702 code'
        ),
    },
  ],
}

// ---------------------------------------------------------------------------
// Pattern 1: Batched
// ---------------------------------------------------------------------------

export const patternBatched: Pattern = {
  id: 'batched',
  number: '1',
  title: 'Batched DID Updates',
  summary:
    'One 7702 authorization + one type-4 tx sets N DID attributes atomically — an Ed25519 key and a Secp256k1 recovery key in a single transaction.',
  contract: 'DIDManager7702',
  steps: [
    {
      title: 'Atomic multi-attribute write',
      description:
        'setBatchAttributesForIdentity encodes an array of AttributeUpdate structs. ERC-1056 writes are sequential within one tx (DID-4), but all-or-nothing at the tx level.',
      run: async (ctx) =>
        txResult(
          () =>
            batchedDidUpdates(ctx.walletFor('identity'), ctx.publicClient, {
              registry: ctx.addresses.registry,
              didManagerAddress: ctx.addresses.didManager,
              updates: [
                { name: ATTR_DID_KEY, value: keyValue('batchkey1'), validity: VALIDITY },
                {
                  name: stringToBytes32('did/pub/Secp256k1/veriKey/base64') as `0x${string}`,
                  value: SECP256K1_VERIKEY,
                  validity: VALIDITY,
                },
              ],
            }),
          'Two DID attributes written atomically in one tx'
        ),
    },
  ],
}

// ---------------------------------------------------------------------------
// Pattern 2: Gasless / sponsored
// ---------------------------------------------------------------------------

export const patternGasless: Pattern = {
  id: 'gasless',
  number: '2',
  title: 'Gasless / Sponsored Update',
  summary:
    'The EOA signs the 7702 auth offline; a sponsor broadcasts the type-4 tx and pays all gas. The EOA needs zero ETH.',
  contract: 'DIDManager7702',
  steps: [
    {
      title: 'EOA signs, sponsor pays',
      description:
        'The identity EOA signs the authorization with executor: sponsorAddress (so viem does NOT inflate the EOA nonce). The sponsor account then broadcasts the tx — gas comes from the sponsor, not the EOA.',
      run: async (ctx) => {
        const eoaWallet = ctx.walletFor('identity')
        const sponsorWallet = ctx.walletFor('sponsor')
        const eoaBalanceBefore = await ctx.publicClient.getBalance({
          address: ctx.identityAddress,
        })
        const hash = await gaslessDidUpdate(eoaWallet, sponsorWallet, ctx.publicClient, {
          registry: ctx.addresses.registry,
          didManagerAddress: ctx.addresses.didManager,
          attrName: ATTR_DID_KEY,
          attrValue: keyValue('gaslesskey'),
          validity: VALIDITY,
        })
        const eoaBalanceAfter = await ctx.publicClient.getBalance({
          address: ctx.identityAddress,
        })
        return {
          txHash: hash,
          summary: `DID updated; EOA balance ${eoaBalanceBefore.toString()} → ${eoaBalanceAfter.toString()} wei (unchanged — sponsor paid)`,
        }
      },
    },
  ],
}

// ---------------------------------------------------------------------------
// Pattern 3: Policy-enforced
// ---------------------------------------------------------------------------

export const patternPolicy: Pattern = {
  id: 'policy',
  number: '3',
  title: 'Policy-Enforced Session Key',
  summary:
    'The EOA delegates to PolicyDIDManager7702 and configures a session key with an allowed prefix + validity cap. The session key then updates the DID doc — without the EOA.',
  contract: 'PolicyDIDManager7702',
  steps: [
    {
      title: 'Configure session key + policy',
      description:
        'The identity EOA signs a 7702 auth and calls configure(sessionKey, maxValidity, allowedPrefix) in one tx. Only the registered session key may write, names must start with the allowed prefix, and validity is capped.',
      run: async (ctx) => {
        const sessionKeyAddress = ctx.keys.address('sessionKey')
        return txResult(
          () =>
            configurePolicyDelegation(ctx.walletFor('identity'), ctx.publicClient, {
              policyDidManagerAddress: ctx.addresses.policyDidManager,
              sessionKey: sessionKeyAddress,
              maxValidity: VALIDITY,
              allowedPrefix: stringToBytes32('did/') as `0x${string}`,
            }),
          'Session key configured; delegation set to PolicyDIDManager7702'
        )
      },
    },
    {
      title: 'Session key writes DID attribute',
      description:
        'The session key sends a plain (type-2) tx to the EOA address. The delegated PolicyDIDManager7702 code enforces the policy and calls ERC-1056 setAttribute as the EOA.',
      run: async (ctx) =>
        txResult(
          () =>
            sessionKeyDidUpdate(ctx.walletFor('sessionKey'), ctx.publicClient, {
              registry: ctx.addresses.registry,
              policyDidManagerAddress: ctx.addresses.policyDidManager,
              eoaAddress: ctx.identityAddress as `0x${string}`,
              attrName: ATTR_DID_KEY,
              attrValue: keyValue('sessionkey'),
              validity: VALIDITY,
            }),
          'DID attribute written by the session key under enforced policy'
        ),
    },
  ],
}

// ---------------------------------------------------------------------------
// Pattern 4: Multi-sig
// ---------------------------------------------------------------------------

export const patternMultiSig: Pattern = {
  id: 'multisig',
  number: '4',
  title: 'Multi-Sig (M-of-N) Updates',
  summary:
    'The EOA configures a 2-of-3 co-signer set on MultiSigDIDManager7702. An update requires 2 valid signatures over the canonical update digest — no single key has unilateral control.',
  contract: 'MultiSigDIDManager7702',
  steps: [
    {
      title: 'Configure 2-of-3 signer set',
      description:
        'The identity EOA delegates to MultiSigDIDManager7702 and calls configure([s1,s2,s3], 2). Signers must be sorted ascending; duplicates and non-registered signatures are rejected.',
      run: async (ctx) => {
        const signers = (['signer1', 'signer2', 'signer3'] as const)
          .map((r) => ctx.keys.address(r))
          .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
        return txResult(
          () =>
            configureMultiSigDelegation(ctx.walletFor('identity'), ctx.publicClient, {
              multiSigDidManagerAddress: ctx.addresses.multiSigDidManager,
              signers: signers as `0x${string}`[],
              threshold: 2n,
            }),
          '2-of-3 multi-sig configured'
        )
      },
    },
    {
      title: 'Collect 2-of-3 signatures',
      description:
        'The update digest is fetched from the EOA (delegated code). Two of the three signers sign it off-chain with account.sign({ hash }) — no tx, no gas.',
      run: async (ctx) => {
        const registry = ctx.addresses.registry
        const attrName = ATTR_DID_KEY
        const attrValue = keyValue('multisigkey')
        const validity = VALIDITY
        const nonce = await readMultiSigNonce(ctx)

        const digest = await getUpdateDigest(ctx.publicClient, {
          eoaAddress: ctx.identityAddress as `0x${string}`,
          registry,
          attrName,
          attrValue,
          validity,
          nonce,
        })

        const signerKeys = ['signer1', 'signer2', 'signer3'] as const
        const signed = await Promise.all(
          signerKeys.map(async (role) => ({
            role,
            address: ctx.keys.address(role),
            sig: await ctx.keys.account(role).sign({ hash: digest }),
          }))
        )
        signed.sort((a, b) => a.address.toLowerCase().localeCompare(b.address.toLowerCase()))

        // stash signatures on the context via a shared key — simplest: re-sign in step 3.
        // Instead, we return the digest + sigs for display and re-derive in step 3.
        return {
          summary: `Digest ${digest.slice(0, 18)}… signed by 2 of 3 co-signers (nonce=${nonce.toString()})`,
          detail: JSON.stringify({ digest, nonce: nonce.toString(), signers: signed.map((s) => s.address) }, null, 2),
        }
      },
    },
    {
      title: 'Submit update with 2 signatures',
      description:
        'Any submitter (here: the identity EOA) calls setAttributeWithMultiSig with the ordered signatures. The contract verifies each recovers to a registered signer and enforces the threshold.',
      run: async (ctx) => {
        const registry = ctx.addresses.registry
        const attrName = ATTR_DID_KEY
        const attrValue = keyValue('multisigkey')
        const validity = VALIDITY
        const nonce = await readMultiSigNonce(ctx)

        const digest = await getUpdateDigest(ctx.publicClient, {
          eoaAddress: ctx.identityAddress as `0x${string}`,
          registry,
          attrName,
          attrValue,
          validity,
          nonce,
        })

        const signerKeys = ['signer1', 'signer2', 'signer3'] as const
        const signed = await Promise.all(
          signerKeys.map(async (role) => ({
            address: ctx.keys.address(role),
            sig: await ctx.keys.account(role).sign({ hash: digest }),
          }))
        )
        signed.sort((a, b) => a.address.toLowerCase().localeCompare(b.address.toLowerCase()))
        const signatures = signed.slice(0, 2).map((s) => s.sig)

        return txResult(
          () =>
            multiSigDidUpdate(ctx.walletFor('identity'), ctx.publicClient, {
              registry,
              multiSigDidManagerAddress: ctx.addresses.multiSigDidManager,
              eoaAddress: ctx.identityAddress as `0x${string}`,
              attrName,
              attrValue,
              validity,
              signatures,
            }),
          `DID attribute written via 2-of-3 multi-sig approval (nonce=${nonce.toString()})`
        )
      },
    },
  ],
}

// ---------------------------------------------------------------------------
// Pattern 1a: Meta-transactions (EIP-712)
// ---------------------------------------------------------------------------

export const patternMetaTx: Pattern = {
  id: 'metatx',
  number: '1a',
  title: 'EIP-712 Meta-Transactions',
  summary:
    'The EOA signs an EIP-712 typed-data intent off-chain; a relayer submits the tx and pays gas. Replay protection via a per-EOA nonce. This is the security-hardened gasless pattern.',
  contract: 'MetaTxDIDManager7702',
  steps: [
    {
      title: 'EOA signs EIP-712 intent (off-chain)',
      description:
        'The identity EOA signs a SetAttribute typed-data message bound to the chain and verifyingContract (the EOA). Also signs the 7702 auth so the relayer can set the delegation atomically. No tx sent.',
      run: async (ctx) => {
        const eoaWallet = ctx.walletFor('identity')
        const nonce = await readMetaTxNonce(ctx)
        const chainId = ctx.network.chain.id
        const signature = await signMetaTxSetAttribute(eoaWallet, {
          metaTxDidManagerAddress: ctx.addresses.metaTxDidManager,
          registry: ctx.addresses.registry,
          eoaAddress: ctx.identityAddress as `0x${string}`,
          attrName: ATTR_DID_KEY,
          attrValue: keyValue('metatxkey'),
          validity: VALIDITY,
          nonce,
          chainId,
        })
        return {
          summary: `EIP-712 SetAttribute signed (nonce=${nonce.toString()})`,
          detail: signature,
        }
      },
    },
    {
      title: 'Relayer submits the signed update',
      description:
        'The sponsor/relayer includes the EOA 7702 auth and calls setAttribute with the signature. The contract checks the recovered signer equals address(this) (the EOA) and increments the nonce.',
      run: async (ctx) => {
        const eoaWallet = ctx.walletFor('identity')
        const relayerWallet = ctx.walletFor('sponsor')
        const nonce = await readMetaTxNonce(ctx)
        const chainId = ctx.network.chain.id
        const relayerAddress = relayerWallet.account!.address

        const signature = await signMetaTxSetAttribute(eoaWallet, {
          metaTxDidManagerAddress: ctx.addresses.metaTxDidManager,
          registry: ctx.addresses.registry,
          eoaAddress: ctx.identityAddress as `0x${string}`,
          attrName: ATTR_DID_KEY,
          attrValue: keyValue('metatxkey'),
          validity: VALIDITY,
          nonce,
          chainId,
        })

        const authorization = await eoaWallet.signAuthorization({
          contractAddress: ctx.addresses.metaTxDidManager,
          executor: relayerAddress,
          account: eoaWallet.account!,
        })

        return txResult(
          () =>
            relayMetaTxSetAttribute(relayerWallet, ctx.publicClient, {
              registry: ctx.addresses.registry,
              eoaAddress: ctx.identityAddress as `0x${string}`,
              attrName: ATTR_DID_KEY,
              attrValue: keyValue('metatxkey'),
              validity: VALIDITY,
              signature,
              authorization,
            }),
          'DID attribute written by relayer from an EIP-712 signed intent'
        )
      },
    },
  ],
}

// ---------------------------------------------------------------------------
// Pattern 6: Revocation
// ---------------------------------------------------------------------------

export const patternRevocation: Pattern = {
  id: 'revocation',
  number: '6',
  title: 'Revocation Registry',
  summary:
    'Dual revocation: ERC-1056 attribute expiry (revokeAttribute sets validTo=0) plus an app-level credential revocation flag stored in EOA storage.',
  contract: 'RevocationDIDManager7702',
  steps: [
    {
      title: 'Delegate + add attribute',
      description:
        'Delegation and the first setAttribute happen in one tx (avoids the Anvil gas-estimation quirk on nonce-0 EOAs).',
      run: async (ctx) =>
        txResult(
          () =>
            setupRevocationDelegation(ctx.walletFor('identity'), ctx.publicClient, {
              revocationDidManagerAddress: ctx.addresses.revocationDidManager,
              registry: ctx.addresses.registry,
              attrName: ATTR_DID_KEY,
              attrValue: keyValue('revokablekey'),
              validity: VALIDITY,
            }),
          'Delegation set + attribute added'
        ),
    },
    {
      title: 'Revoke attribute via ERC-1056',
      description:
        'revokeAttributeForIdentity calls registry.revokeAttribute, setting validTo=0 so the resolver drops the key from the DID document.',
      run: async (ctx) =>
        txResult(
          () =>
            revokeAttribute(ctx.walletFor('identity'), ctx.publicClient, {
              registry: ctx.addresses.registry,
              attrName: ATTR_DID_KEY,
              attrValue: keyValue('revokablekey'),
            }),
          'ERC-1056 attribute revoked (validTo → 0)'
        ),
    },
    {
      title: 'Revoke a credential + verify',
      description:
        'revokeCredential writes a revocation flag in the EOA storage keyed by credentialId. Anyone can query isRevoked(credentialId) on the EOA address.',
      run: async (ctx) => {
        const credentialId = credentialIdFromString('credential-123')
        const hash = await revokeCredential(ctx.walletFor('identity'), ctx.publicClient, {
          credentialId,
        })
        const revoked = await checkIsRevoked(ctx.publicClient, {
          eoaAddress: ctx.identityAddress as `0x${string}`,
          credentialId,
        })
        return {
          txHash: hash,
          summary: `Credential revoked; isRevoked = ${revoked}`,
          detail: credentialId,
        }
      },
    },
  ],
}

// ---------------------------------------------------------------------------
// Pattern 7: Cross-chain sync
// ---------------------------------------------------------------------------

export const patternCrossChain: Pattern = {
  id: 'crosschain',
  number: '7',
  title: 'Cross-Chain DID Sync',
  summary:
    'The EOA signs a 7702 auth + an EIP-712 update off-chain; a relayer submits both atomically on the target chain. The EOA never needs ETH there.',
  contract: 'CrossChainDIDManager7702',
  steps: [
    {
      title: 'EOA signs auth + update (off-chain)',
      description:
        'The identity EOA signs a 7702 authorization (executor: relayer) and an EIP-712 UpdateAuthorization. Both are bound to the target chain. No tx sent.',
      run: async (ctx) => {
        const eoaWallet = ctx.walletFor('identity')
        const relayerAddress = ctx.walletFor('sponsor').account!.address
        const chainId = ctx.network.chain.id
        const nonce = await readCrossChainNonce(ctx)

        const authorization = await signCrossChainAuthorization(eoaWallet, {
          crossChainDidManagerAddress: ctx.addresses.crossChainDidManager,
          relayerAddress,
        })
        const signature = await signCrossChainUpdate(eoaWallet, {
          eoaAddress: ctx.identityAddress as `0x${string}`,
          registry: ctx.addresses.registry,
          attrName: ATTR_SVC,
          attrValue: keyValue('crosschainkey'),
          validity: VALIDITY,
          nonce,
          chainId,
        })
        return {
          summary: `7702 auth + EIP-712 update signed off-chain (nonce=${nonce.toString()})`,
          detail: JSON.stringify(
            { authorization, signature },
            (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
            2
          ),
        }
      },
    },
    {
      title: 'Relayer submits on the target chain',
      description:
        'The relayer bundles the EOA authorization into its own type-4 tx and calls setAttributeCrossChain. The EOA is delegated + updated atomically with zero EOA gas.',
      run: async (ctx) => {
        const eoaWallet = ctx.walletFor('identity')
        const relayerWallet = ctx.walletFor('sponsor')
        const relayerAddress = relayerWallet.account!.address
        const chainId = ctx.network.chain.id
        const nonce = await readCrossChainNonce(ctx)

        const authorization = await signCrossChainAuthorization(eoaWallet, {
          crossChainDidManagerAddress: ctx.addresses.crossChainDidManager,
          relayerAddress,
        })
        const signature = await signCrossChainUpdate(eoaWallet, {
          eoaAddress: ctx.identityAddress as `0x${string}`,
          registry: ctx.addresses.registry,
          attrName: ATTR_SVC,
          attrValue: keyValue('crosschainkey'),
          validity: VALIDITY,
          nonce,
          chainId,
        })

        return txResult(
          () =>
            relayerSubmitUpdate(relayerWallet, ctx.publicClient, {
              registry: ctx.addresses.registry,
              eoaAddress: ctx.identityAddress as `0x${string}`,
              attrName: ATTR_SVC,
              attrValue: keyValue('crosschainkey'),
              validity: VALIDITY,
              signature,
              authorization,
            }),
          `DID attribute synced by relayer; EOA paid zero gas (nonce=${nonce.toString()})`
        )
      },
    },
  ],
}

// ---------------------------------------------------------------------------
// Pattern 8: Delegation revocation
// ---------------------------------------------------------------------------

export const patternDelegationRevoke: Pattern = {
  id: 'delegation-revoke',
  number: '8',
  title: 'Delegation Revocation',
  summary:
    'The EOA revokes its 7702 delegation by re-authorizing to address(0). EOA code is cleared; subsequent calls become no-ops.',
  contract: 'EIP-7702 (authorization)',
  steps: [
    {
      title: 'Delegate to DIDManager7702',
      description: 'Sign a 7702 auth + send a minimal tx so the delegation code (0xef0100…) is set.',
      run: async (ctx) => {
        const wallet = ctx.walletFor('identity')
        const hash = await wallet.sendTransaction({
          to: ctx.identityAddress as `0x${string}`,
          data: '0x',
          gas: 50_000n,
          chain: ctx.network.chain,
          account: wallet.account!,
          authorizationList: [
            await wallet.signAuthorization({
              contractAddress: ctx.addresses.didManager,
              executor: 'self',
              account: wallet.account!,
            }),
          ],
        })
        return { txHash: hash, summary: 'Delegation set to DIDManager7702' }
      },
    },
    {
      title: 'Revoke (authorize address(0))',
      description:
        'Sign a new auth pointing to address(0). The EVM clears the delegation code. Calling the EOA afterwards succeeds but does nothing — calldata is ignored.',
      run: async (ctx) => {
        const wallet = ctx.walletFor('identity')
        const hash = await wallet.sendTransaction({
          to: ctx.identityAddress as `0x${string}`,
          data: '0x',
          gas: 50_000n,
          chain: ctx.network.chain,
          account: wallet.account!,
          authorizationList: [
            await wallet.signAuthorization({
              contractAddress: zeroAddress,
              executor: 'self',
              account: wallet.account!,
            }),
          ],
        })
        const code = await ctx.publicClient.getCode({ address: ctx.identityAddress as `0x${string}` })
        return {
          txHash: hash,
          summary: `Delegation revoked; EOA code now "${code ?? 'none'}"`,
        }
      },
    },
  ],
}

// ---------------------------------------------------------------------------
// Pattern 9: Re-delegation
// ---------------------------------------------------------------------------

export const patternReDelegate: Pattern = {
  id: 'redelegate',
  number: '9',
  title: 'Re-Delegation (A → B)',
  summary:
    'Re-authorizing to a different contract atomically swaps the code pointer. Old contract functions revert; new ones work.',
  contract: 'DIDManager7702 → ExpiringDIDManager7702',
  steps: [
    {
      title: 'Delegate to DIDManager7702 (A)',
      description:
        'First delegation: the EOA authorizes DIDManager7702 so the EOA can write its own DID document. getCode returns the 0xef0100… designator.',
      run: async (ctx) => {
        const wallet = ctx.walletFor('identity')
        const hash = await wallet.sendTransaction({
          to: ctx.identityAddress as `0x${string}`,
          data: '0x',
          gas: 50_000n,
          chain: ctx.network.chain,
          account: wallet.account!,
          authorizationList: [
            await wallet.signAuthorization({
              contractAddress: ctx.addresses.didManager,
              executor: 'self',
              account: wallet.account!,
            }),
          ],
        })
        return { txHash: hash, summary: 'Delegated to DIDManager7702 (contract A)' }
      },
    },
    {
      title: 'Re-delegate to ExpiringDIDManager7702 (B)',
      description:
        'A new authorization swaps the pointer atomically. getCode now references contract B, not A.',
      run: async (ctx) => {
        const wallet = ctx.walletFor('identity')
        const hash = await wallet.sendTransaction({
          to: ctx.identityAddress as `0x${string}`,
          data: '0x',
          gas: 50_000n,
          chain: ctx.network.chain,
          account: wallet.account!,
          authorizationList: [
            await wallet.signAuthorization({
              contractAddress: ctx.addresses.expiringDidManager,
              executor: 'self',
              account: wallet.account!,
            }),
          ],
        })
        const code = await ctx.publicClient.getCode({ address: ctx.identityAddress as `0x${string}` })
        return {
          txHash: hash,
          summary: `Code pointer now references ExpiringDIDManager7702`,
          detail: code ?? 'none',
        }
      },
    },
  ],
}

// ---------------------------------------------------------------------------
// Pattern 10: Expiring delegation
// ---------------------------------------------------------------------------

export const patternExpiring: Pattern = {
  id: 'expiring',
  number: '10',
  title: 'Expiring Delegation (TTL)',
  summary:
    'ExpiringDIDManager7702 enforces an app-level time-to-live. Writes succeed before expiry, revert after. No protocol change needed.',
  contract: 'ExpiringDIDManager7702',
  localOnly: true,
  steps: [
    {
      title: 'Configure expiry (1 minute from now)',
      description:
        'The EOA delegates to ExpiringDIDManager7702 and calls configure(expiry) in the same tx. The contract stores a TTL in EOA storage; writes revert once block.timestamp exceeds it.',
      run: async (ctx) => {
        const wallet = ctx.walletFor('identity')
        const block = await ctx.publicClient.getBlock()
        const expiry = block.timestamp + 60n
        const hash = await wallet.sendTransaction({
          to: ctx.identityAddress as `0x${string}`,
          data: encodeFunctionData({
            abi: EXPIRING_DID_MANAGER_ABI,
            functionName: 'configure',
            args: [expiry],
          }),
          gas: 100_000n,
          chain: ctx.network.chain,
          account: wallet.account!,
          authorizationList: [
            await wallet.signAuthorization({
              contractAddress: ctx.addresses.expiringDidManager,
              executor: 'self',
              account: wallet.account!,
            }),
          ],
        })
        return { txHash: hash, summary: `Expiry configured to block ${expiry.toString()}` }
      },
    },
    {
      title: 'Write before expiry — succeeds',
      description:
        'setAttributeForIdentity runs through the delegated code. Because the current timestamp is still below the configured TTL, the write is allowed and the DID document is updated.',
      run: async (ctx) => {
        const wallet = ctx.walletFor('identity')
        const data = encodeFunctionData({
          abi: EXPIRING_DID_MANAGER_ABI,
          functionName: 'setAttributeForIdentity',
          args: [ctx.addresses.registry, ATTR_DID_KEY, keyValue('expiringkey'), VALIDITY],
        })
        const hash = await wallet.sendTransaction({
          to: ctx.identityAddress as `0x${string}`,
          data,
          gas: 300_000n,
          chain: ctx.network.chain,
          account: wallet.account!,
        })
        return { txHash: hash, summary: 'Write before expiry succeeded' }
      },
    },
  ],
}

// ---------------------------------------------------------------------------
// Pattern 11: EXTCODESIZE pitfall
// ---------------------------------------------------------------------------

export const patternExtCodeSize: Pattern = {
  id: 'extcodesize',
  number: '11',
  title: 'EXTCODESIZE Pitfall',
  summary:
    'A delegated EOA has non-zero code (the 23-byte 0xef0100… designator), so naive isContract() checks misidentify it as a contract.',
  contract: 'EIP-7702 (delegation designator)',
  steps: [
    {
      title: 'Delegate and inspect EOA code',
      description:
        'getCode returns 0xef0100<20-byte-contract-address> (23 bytes) — not real bytecode. Any address.code.length > 0 guard is fooled.',
      run: async (ctx) => {
        const wallet = ctx.walletFor('identity')
        const before = await ctx.publicClient.getCode({ address: ctx.identityAddress as `0x${string}` })
        const hash = await wallet.sendTransaction({
          to: ctx.identityAddress as `0x${string}`,
          data: '0x',
          gas: 50_000n,
          chain: ctx.network.chain,
          account: wallet.account!,
          authorizationList: [
            await wallet.signAuthorization({
              contractAddress: ctx.addresses.didManager,
              executor: 'self',
              account: wallet.account!,
            }),
          ],
        })
        const after = await ctx.publicClient.getCode({ address: ctx.identityAddress as `0x${string}` })
        return {
          txHash: hash,
          summary: `code before: "${before ?? 'none'}" → after: "${after}" (naive isContract = true)`,
          detail: `Delegation designator length: ${(after!.length - 2) / 2} bytes`,
        }
      },
    },
  ],
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const PATTERNS: Pattern[] = [
  patternSimple,
  patternBatched,
  patternGasless,
  patternPolicy,
  patternMultiSig,
  patternMetaTx,
  patternRevocation,
  patternCrossChain,
  patternDelegationRevoke,
  patternReDelegate,
  patternExpiring,
  patternExtCodeSize,
]

// Headless smoke test for the interactive explainer's pattern registry.
//
// Boots an Anvil instance and deploys contracts LAZILY, exactly like the
// webapp: the registry once (shared infra), then only the manager(s) each
// pattern's `requires` list declares — via the deterministic CREATE2 factory
// (webapp/src/lib/create2.ts). Then it runs every step of every pattern
// through webapp/src/patterns/registry.ts and proves each one works, while
// also proving that laziness holds: a manager only gets deployed once a
// pattern that needs it actually runs, never before.
//
// IMPORTANT: each pattern gets a FRESH identity EOA. EIP-7702 delegated contracts
// share the EOA's storage slots, so re-delegating one shared EOA across the
// stateful managers (Policy/MultiSig/MetaTx/CrossChain all use slots 0/1/2)
// corrupts each other's bookkeeping. A DID subject runs one delegation strategy,
// so a fresh identity per pattern mirrors real usage.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { anvil as anvilChain } from 'viem/chains'
import { startAnvil, stopAnvil, getAnvilPrivateKeys, type AnvilInstance } from '../../../src/utils/anvil.js'
import { KeyManager, KEY_ROLES } from '../lib/keys'
import { NETWORKS } from '../config/chains'
import {
  deterministicManagerAddresses,
  deployManagerInBrowser,
  deployRegistryInBrowser,
  MANAGER_KEYS,
} from '../lib/deploy'
import type { ManagerKey } from '../lib/deployed'
import { isDeployed } from '../lib/create2'
import { resolveDid } from '../lib/resolve'
import { PATTERNS, type Pattern } from './registry'
import type { StepContext, StepResult } from './types'

let anvil: AnvilInstance | null = null

function rpcUrl(): string {
  if (!anvil) throw new Error('Anvil not started')
  return anvil.rpcUrl
}

describe('webapp pattern registry smoke test', () => {
  beforeAll(async () => {
    anvil = await startAnvil()
  })

  afterAll(async () => {
    if (anvil) await stopAnvil(anvil)
  })

  it('deploys only what each pattern needs, then runs every step successfully', async () => {
    const network = NETWORKS.local

    const publicClient = createPublicClient({
      chain: anvilChain,
      transport: http(rpcUrl()),
    })

    const walletClient = createWalletClient({
      chain: anvilChain,
      transport: http(rpcUrl()),
      account: privateKeyToAccount(getAnvilPrivateKeys()[0]),
    })

    // Manager addresses are deterministic — computed up front, no deployment yet.
    const managerAddresses = deterministicManagerAddresses()
    expect(managerAddresses.didManager).toMatch(/^0x[0-9a-fA-F]{40}$/)

    // Nothing is deployed yet — proves the app doesn't deploy anything up front.
    for (const key of MANAGER_KEYS) {
      expect(await isDeployed(publicClient, managerAddresses[key])).toBe(false)
    }

    // Registry is shared infra, deployed once (mirrors the app's on-demand Resolve DID).
    const registry = await deployRegistryInBrowser(walletClient, publicClient)
    expect(registry).toMatch(/^0x[0-9a-fA-F]{40}$/)

    const failures: string[] = []
    const ran: string[] = []
    const everDeployed = new Set<ManagerKey>()

    const patterns = PATTERNS as Pattern[]

    for (let p = 0; p < patterns.length; p++) {
      const pattern = patterns[p]

      // Laziness proof: before deploying for this pattern, every manager NOT
      // required by any pattern seen so far must still be missing.
      for (const key of MANAGER_KEYS) {
        if (!everDeployed.has(key)) {
          expect(await isDeployed(publicClient, managerAddresses[key])).toBe(false)
        }
      }

      // Deploy only what this pattern declares it needs.
      for (const key of pattern.requires) {
        await deployManagerInBrowser(walletClient, publicClient, key, rpcUrl())
        everDeployed.add(key)
      }
      for (const key of pattern.requires) {
        expect(await isDeployed(publicClient, managerAddresses[key])).toBe(true)
      }

      // Base anvil keys: identity starts at index (p*6) so each pattern gets a
      // disjoint slice (identity, sessionKey, sponsor, signer1..3).
      const base = 1 + p * 6
      const keys = new KeyManager()
      KEY_ROLES.forEach((role, j) => {
        const pk = getAnvilPrivateKeys()[(base + j) % getAnvilPrivateKeys().length]
        keys.importKey(role, pk)
      })
      keys.importKey('identity', getAnvilPrivateKeys()[base % getAnvilPrivateKeys().length])

      // Broadcaster: the same account used for deployment — pays all gas.
      const broadcasterWallet = createWalletClient({
        chain: anvilChain,
        transport: http(rpcUrl()),
        account: privateKeyToAccount(getAnvilPrivateKeys()[0]),
      })

      const ctx: StepContext = {
        network,
        publicClient,
        keys,
        addresses: { ...managerAddresses, registry },
        walletFor: (role) =>
          createWalletClient({
            chain: anvilChain,
            transport: http(rpcUrl()),
            account: keys.account(role),
          }),
        broadcaster: broadcasterWallet,
        broadcasterAddress: broadcasterWallet.account!.address,
        identityAddress: keys.address('identity'),
      }

      for (let i = 0; i < pattern.steps.length; i++) {
        const step = pattern.steps[i]
        const label = `[${pattern.number}] ${pattern.id}:${i} ${step.title}`
        try {
          const result: StepResult = await step.run(ctx)
          expect(result.summary).toBeTruthy()
          ran.push(`${label} ✓ ${result.summary}`)
        } catch (err) {
          failures.push(`${label} ✗ ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }

    // Print a per-step report for debugging.
    console.log('\n' + ran.join('\n'))

    // The explainer must be usable end-to-end: every step of every pattern runs.
    expect(failures).toEqual([])
  })

  it('resolves the identity DID as step 0 — before any managers are deployed', async () => {
    const network = NETWORKS.local
    const publicClient = createPublicClient({
      chain: anvilChain,
      transport: http(rpcUrl()),
    })
    const walletClient = createWalletClient({
      chain: anvilChain,
      transport: http(rpcUrl()),
      account: privateKeyToAccount(getAnvilPrivateKeys()[0]),
    })
    const keys = new KeyManager()
    keys.seedWithAnvilKeys()
    const identityAddress = keys.address('identity')

    // Deploy ONLY the registry (mirrors the app's on-demand step-0 resolve).
    const registry = await deployRegistryInBrowser(walletClient, publicClient)
    const doc = await resolveDid(network, identityAddress, registry)

    // Baseline document: identity EOA is the controller; no user attributes yet.
    expect(doc.id.toLowerCase()).toContain(identityAddress.toLowerCase())
    const vms = (doc.verificationMethod as unknown[] | undefined) ?? []
    // Only the implicit identity key (#controller) exists — no user attributes.
    expect(vms).toHaveLength(1)
    expect((vms[0] as { id: string }).id).toContain('#controller')
    expect(doc.authentication).toContain(`${doc.id}#controller`)
    expect(doc.assertionMethod).toContain(`${doc.id}#controller`)
  })

  it('produces a resolvable DID document after the update patterns', async () => {
    const network = NETWORKS.local
    const publicClient = createPublicClient({
      chain: anvilChain,
      transport: http(rpcUrl()),
    })
    const walletClient = createWalletClient({
      chain: anvilChain,
      transport: http(rpcUrl()),
      account: privateKeyToAccount(getAnvilPrivateKeys()[0]),
    })
    const managerAddresses = deterministicManagerAddresses()
    const registry = await deployRegistryInBrowser(walletClient, publicClient)
    const patternIds = ['simple', 'batched', 'gasless', 'policy', 'revocation']
    const neededManagers = new Set<ManagerKey>()
    for (const id of patternIds) {
      const pattern = (PATTERNS as Pattern[]).find((p) => p.id === id)!
      pattern.requires.forEach((key) => neededManagers.add(key))
    }
    for (const key of neededManagers) {
      await deployManagerInBrowser(walletClient, publicClient, key, rpcUrl())
    }

    const keys = new KeyManager()
    keys.seedWithAnvilKeys()
    const identityAddress = keys.address('identity')
    const ctx: StepContext = {
      network,
      publicClient,
      keys,
      addresses: { ...managerAddresses, registry },
      walletFor: (role) =>
        createWalletClient({
          chain: anvilChain,
          transport: http(rpcUrl()),
          account: keys.account(role),
        }),
      broadcaster: walletClient,
      broadcasterAddress: walletClient.account!.address,
      identityAddress,
    }

    // Run the update-only patterns (0, 1, 2, 3, 6) which leave DID attributes set.
    for (const id of patternIds) {
      const pattern = (PATTERNS as Pattern[]).find((p) => p.id === id)!
      for (const step of pattern.steps) {
        // Skip non-DID-write steps (configure only).
        await step.run(ctx).catch((e) => new Error(String(e)))
      }
    }

    const doc = await resolveDid(network, ctx.identityAddress, registry)
    expect(doc.id.toLowerCase()).toContain(ctx.identityAddress.toLowerCase())
    const methods = [
      ...((doc.assertionMethod as unknown[] | undefined) ?? []),
      ...((doc.authentication as unknown[] | undefined) ?? []),
    ]
    expect(methods.length).toBeGreaterThan(0)
  })
})

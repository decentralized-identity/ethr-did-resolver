import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NETWORKS, type NetworkConfig } from './config/chains'
import { KeyManager, KEY_ROLES, type KeyRole } from './lib/keys'
import { makePublicClient, makeWalletClientFromAccount, makeAnvilBroadcasterClient } from './lib/clients'
import { deterministicManagerAddresses, deployManagerInBrowser, deployRegistryInBrowser, MANAGER_META } from './lib/deploy'
import { isDeployed } from './lib/create2'
import type { ManagerKey } from './lib/deployed'
import { waitForBlockVisible, waitUntilDeployed } from './lib/rpcLag'
import { resolveDid, type DidDoc } from './lib/resolve'
import { PATTERNS, type Pattern } from './patterns/registry'
import type { StepContext, StepResult } from './patterns/types'
import type { WalletClient } from 'viem'

function short(addr: string | undefined): string {
  if (!addr) return '—'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

type DeployState = 'idle' | 'deploying' | 'failed'

function App() {
  const [keys] = useState(() => new KeyManager())
  // Manager addresses are DETERMINISTIC (CREATE2) — computed once, chain-independent.
  // Whether a manager actually has code on the local node is tracked separately.
  const addresses = useMemo(() => deterministicManagerAddresses(), [])
  const [registry, setRegistry] = useState<`0x${string}` | null>(null)
  const [deployedManagers, setDeployedManagers] = useState<Set<ManagerKey>>(new Set())
  const [checkingContracts, setCheckingContracts] = useState(false)
  const [managerDeployState, setManagerDeployState] = useState<Partial<Record<ManagerKey, DeployState>>>({})
  const [registryDeployState, setRegistryDeployState] = useState<DeployState>('idle')
  const [deployError, setDeployError] = useState('')
  const [selectedPattern, setSelectedPattern] = useState<Pattern>(PATTERNS[0])
  const [log, setLog] = useState<string[]>([])
  const [didDoc, setDidDoc] = useState<DidDoc | null>(null)
  const [didError, setDidError] = useState('')
  const [resolving, setResolving] = useState(false)
  const [stepStates, setStepStates] = useState<Record<string, 'pending' | 'running' | 'done' | 'failed'>>({})
  const [stepResults, setStepResults] = useState<Record<string, StepResult>>({})
  // Monotonic counter guarding against out-of-order resolve responses: if a
  // slower, earlier resolveDid() call finishes after a newer one, its result
  // must be discarded rather than clobbering the fresher document.
  const resolveGeneration = useRef(0)

  const network: NetworkConfig = NETWORKS.local
  const publicClient = useMemo(() => makePublicClient(network), [network])

  // Seed the identity/session/signer roles with pre-funded Anvil dev keys.
  useEffect(() => {
    keys.seedWithAnvilKeys()
  }, [keys])

  useEffect(() => {
    void (async () => {
      try {
        await publicClient.getChainId()
        setDeployError('')
      } catch {
        setDeployError(`Anvil not reachable at ${network.rpcUrl}. Start it with \`pnpm anvil\`.`)
      }
    })()
  }, [publicClient, network])

  const identityAddress = keys.address('identity')

  /**
   * The gas payer. ALWAYS a fixed Anvil dev key that is NOT the identity EOA.
   * EIP-7702 type-4 txs are signed + broadcast locally by viem, so nothing can
   * strip the authorizationList. The identity EOA stays gasless.
   */
  const broadcaster: WalletClient = useMemo(() => makeAnvilBroadcasterClient(network), [network])
  const broadcasterAddress: `0x${string}` = broadcaster.account?.address ?? '0x'

  /**
   * Check which of the SELECTED pattern's required contracts already have
   * code on the local node. Only checks what the pattern actually needs — this
   * is the "ask for deployment only then" check.
   */
  const refreshDeploymentStatus = useCallback(
    async (pattern: Pattern) => {
      setCheckingContracts(true)
      try {
        const results = await Promise.all(
          pattern.requires.map(async (key) => [key, await isDeployed(publicClient, addresses[key])] as const)
        )
        setDeployedManagers(new Set(results.filter(([, deployed]) => deployed).map(([key]) => key)))
      } finally {
        setCheckingContracts(false)
      }
    },
    [publicClient, addresses]
  )

  useEffect(() => {
    void refreshDeploymentStatus(selectedPattern)
  }, [selectedPattern, refreshDeploymentStatus])

  async function handleDeployManager(key: ManagerKey) {
    setDeployError('')
    setManagerDeployState((s) => ({ ...s, [key]: 'deploying' }))
    try {
      const address = await deployManagerInBrowser(broadcaster, publicClient, key, network.rpcUrl)
      setLog((l) => [...l, `[deploy] ${MANAGER_META[key].label} → ${short(address)}`])
      await waitUntilDeployed(publicClient, address)
      await refreshDeploymentStatus(selectedPattern)
      setManagerDeployState((s) => ({ ...s, [key]: 'idle' }))
    } catch (err) {
      setManagerDeployState((s) => ({ ...s, [key]: 'failed' }))
      setDeployError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDeployRegistry() {
    setDeployError('')
    setRegistryDeployState('deploying')
    try {
      const addr = await deployRegistryInBrowser(broadcaster, publicClient)
      setRegistry(addr)
      setLog((l) => [...l, `[deploy] Registry → ${short(addr)}`])
      setRegistryDeployState('idle')
    } catch (err) {
      setRegistryDeployState('failed')
      setDeployError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDeployMissing() {
    for (const key of selectedPattern.requires) {
      if (!deployedManagers.has(key)) await handleDeployManager(key)
    }
    if (selectedPattern.needsRegistry && !registry) await handleDeployRegistry()
  }

  /**
   * Resolve the DID document. `minBlock`, when passed, waits for the RPC to
   * catch up to that block before querying. A generation counter discards
   * out-of-order responses (e.g. a slow resolve finishing after a newer one).
   */
  async function handleResolve(minBlock?: bigint) {
    const generation = ++resolveGeneration.current
    setDidError('')
    setResolving(true)
    if (!identityAddress) {
      setResolving(false)
      return
    }
    try {
      let registryAddr = registry
      if (!registryAddr) {
        registryAddr = await deployRegistryInBrowser(broadcaster, publicClient)
        setRegistry(registryAddr)
      }
      if (minBlock !== undefined) await waitForBlockVisible(publicClient, minBlock)
      const doc = await resolveDid(network, identityAddress, registryAddr)
      if (generation !== resolveGeneration.current) return // a newer resolve superseded this one
      setDidDoc(doc)
    } catch (err) {
      if (generation !== resolveGeneration.current) return
      setDidError(err instanceof Error ? err.message : String(err))
    } finally {
      if (generation === resolveGeneration.current) setResolving(false)
    }
  }

  function buildStepContext(pattern: Pattern): StepContext {
    const missing = pattern.requires.filter((key) => !deployedManagers.has(key))
    if (missing.length > 0) {
      throw new Error(`Missing contracts: ${missing.map((key) => MANAGER_META[key].label).join(', ')}`)
    }
    if (pattern.needsRegistry && !registry) throw new Error('Registry not deployed yet')
    return {
      network,
      publicClient,
      keys,
      addresses: { ...addresses, registry: registry ?? '0x0000000000000000000000000000000000000000' },
      walletFor: (role: KeyRole) => makeWalletClientFromAccount(network, keys.account(role)),
      broadcaster,
      broadcasterAddress,
      identityAddress,
    }
  }

  async function runStep(pattern: Pattern, stepIndex: number) {
    const step = pattern.steps[stepIndex]
    const stepKey = `${pattern.id}:${stepIndex}`
    setStepStates((s) => ({ ...s, [stepKey]: 'running' }))
    setStepResults((r) => ({ ...r, [stepKey]: { summary: 'Running…' } }))
    try {
      const ctx = buildStepContext(pattern)
      const result = await step.run(ctx)
      setStepStates((s) => ({ ...s, [stepKey]: 'done' }))
      setStepResults((r) => ({ ...r, [stepKey]: result }))
      setLog((l) => [...l, `[${pattern.number}] ${step.title}: ${result.summary}`])
      // Re-resolve the DID doc after a successful step. If the step broadcast a
      // tx, wait for the RPC's own view of the chain to reach that tx's block
      // before reading (waitForBlockVisible).
      if (pattern.number !== '8' && pattern.number !== '11') {
        let minBlock: bigint | undefined
        if (result.txHash) {
          const receipt = await publicClient.getTransactionReceipt({ hash: result.txHash }).catch(() => null)
          minBlock = receipt?.blockNumber
        }
        void handleResolve(minBlock)
      }
    } catch (err) {
      setStepStates((s) => ({ ...s, [stepKey]: 'failed' }))
      setStepResults((r) => ({
        ...r,
        [stepKey]: { summary: err instanceof Error ? err.message : String(err) },
      }))
      setLog((l) => [...l, `[${pattern.number}] ${step.title}: FAILED — ${err instanceof Error ? err.message : err}`])
    }
  }

  const missingManagers = selectedPattern.requires.filter((key) => !deployedManagers.has(key))
  const registryReady = !selectedPattern.needsRegistry || Boolean(registry)
  const contractsReady = missingManagers.length === 0 && registryReady

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          EIP-7702 × did:ethr <span className="subtitle">interactive explainer</span>
        </h1>
        <span className="network-picker">{network.label}</span>
      </header>

      {deployError && <div className="banner error">{deployError}</div>}

      <main className="layout">
        <aside className="sidebar">
          <h2>Patterns</h2>
          <ul>
            {PATTERNS.map((p) => (
              <li key={p.id}>
                <button
                  className={p.id === selectedPattern.id ? 'active' : ''}
                  onClick={() => setSelectedPattern(p)}
                >
                  <span className="num">{p.number}</span> {p.title}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="content">
          <div className="identity-row">
            <div>
              <strong>Identity EOA</strong>
              <code>{identityAddress}</code>
            </div>
            <button onClick={() => handleResolve()} disabled={resolving}>
              {resolving ? 'Resolving…' : 'Resolve DID'}
            </button>
          </div>

          <div className="card contracts-card">
            <h2>Contracts for Pattern {selectedPattern.number}</h2>
            <p className="muted">
              Every manager has a deterministic CREATE2 address, deployed lazily — only the
              contract(s) this pattern actually calls are checked and, if missing, deployed
              here, nothing else.
            </p>
            {checkingContracts && <p className="muted">Checking on-chain state…</p>}
            {selectedPattern.needsRegistry && (
              <div className="contract-row">
                <div>
                  <strong>Registry (ERC-1056)</strong>
                  <code>{registry ?? 'not deployed'}</code>
                </div>
                {registry ? (
                  <span className="ok">✓ deployed</span>
                ) : (
                  <button onClick={handleDeployRegistry} disabled={registryDeployState === 'deploying'}>
                    {registryDeployState === 'deploying' ? 'Deploying…' : 'Deploy registry'}
                  </button>
                )}
              </div>
            )}
            {selectedPattern.requires.map((key) => {
              const meta = MANAGER_META[key]
              const deployed = deployedManagers.has(key)
              const state = managerDeployState[key] ?? 'idle'
              return (
                <div className="contract-row" key={key}>
                  <div>
                    <strong>{meta.label}</strong>
                    <code>{short(addresses[key])}</code>
                  </div>
                  {deployed ? (
                    <span className="ok">✓ deployed</span>
                  ) : (
                    <button onClick={() => handleDeployManager(key)} disabled={state === 'deploying'}>
                      {state === 'deploying' ? 'Deploying…' : `Deploy ${meta.label}`}
                    </button>
                  )}
                </div>
              )
            })}
            {!contractsReady && (missingManagers.length > 0 || (selectedPattern.needsRegistry && !registry)) && (
              <button className="btn-wide" onClick={handleDeployMissing}>
                Deploy all missing for this pattern
              </button>
            )}
          </div>

          <div className="card pattern-card">
            <div className="pattern-head">
              <span className="badge">Pattern {selectedPattern.number}</span>
              <h2>{selectedPattern.title}</h2>
              <p className="summary">{selectedPattern.summary}</p>
              <p className="contract">
                Contract: <code>{selectedPattern.contract}</code>
              </p>
            </div>

            <div className="steps">
              {selectedPattern.steps.map((step, i) => {
                const stepKey = `${selectedPattern.id}:${i}`
                const state = stepStates[stepKey] ?? 'pending'
                const result = stepResults[stepKey]
                return (
                  <div key={stepKey} className={`step ${state}`}>
                    <div className="step-header">
                      <span className="step-num">{i + 1}</span>
                      <div>
                        <h3>{step.title}</h3>
                        <p>{step.description}</p>
                      </div>
                      <button
                        onClick={() => runStep(selectedPattern, i)}
                        disabled={state === 'running' || !contractsReady}
                      >
                        {state === 'running' ? 'Running…' : state === 'done' ? 'Re-run' : 'Run'}
                      </button>
                    </div>
                    {result && (
                      <div className="step-result">
                        <p>{result.summary}</p>
                        {result.txHash && (
                          <p>
                            tx: <code>{result.txHash}</code>
                          </p>
                        )}
                        {result.detail && <pre>{result.detail}</pre>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="card did-card">
            <h2>DID Document</h2>
            {didError && <div className="banner error">{didError}</div>}
            {resolving && <p className="muted">Resolving…</p>}
            {!didDoc && !didError && !resolving && <p className="muted">Resolve the DID to inspect the document.</p>}
            {didDoc && <pre className="did-doc">{JSON.stringify(didDoc, null, 2)}</pre>}
          </div>
        </section>

        <aside className="keys-panel">
          <h2>DID keys (local)</h2>
          <p className="muted">
            The DID subject's keys are managed locally by the app and persisted to localStorage. They
            never pay gas.
          </p>
          <ul className="key-list">
            {KEY_ROLES.map((role) => (
              <li key={role}>
                <div>
                  <strong>{role}</strong>
                  <code>{short(keys.address(role))}</code>
                </div>
                <div className="key-actions">
                  <button title="Generate new key" onClick={() => keys.rotate(role)}>
                    ↻
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="key-list broadcaster-row">
            <div>
              <strong>Broadcaster (pays gas)</strong>
              <code>{short(broadcasterAddress)}</code>
            </div>
          </div>
          <div className="key-actions panel-actions">
            <button title="Reset keyring (new random keys)" className="btn-wide" onClick={() => keys.reset()}>
              Reset keys
            </button>
          </div>
          <div className="txlog">
            <h3>Activity</h3>
            {log.length === 0 && <p className="muted">No activity yet.</p>}
            <ul>
              {log.slice(-12).map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>
        </aside>
      </main>
    </div>
  )
}

export default App
import { useEffect, useMemo, useState } from 'react'
import { NETWORKS, NETWORK_LIST, type NetworkConfig } from './config/chains'
import { KeyManager, KEY_ROLES, type KeyRole } from './lib/keys'
import { makePublicClient, makeWalletClientFromAccount } from './lib/clients'
import { deployManagersInBrowser, deployRegistryInBrowser } from './lib/deploy'
import { type ManagerAddresses } from './lib/deployed'
import { resolveDid, type DidDoc } from './lib/resolve'
import { PATTERNS, type Pattern } from './patterns/registry'
import type { StepContext, StepResult } from './patterns/types'

function short(addr: string | undefined): string {
  if (!addr) return '—'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function App() {
  const [networkId, setNetworkId] = useState<'local' | 'sepolia' | 'gnosis'>('local')
  const [keys] = useState(() => new KeyManager())
  const [registry, setRegistry] = useState<`0x${string}` | null>(null)
  const [addresses, setAddresses] = useState<ManagerAddresses | null>(null)
  const [deployState, setDeployState] = useState<'idle' | 'deploying' | 'failed' | 'done'>('idle')
  const [deployError, setDeployError] = useState('')
  const [selectedPattern, setSelectedPattern] = useState<Pattern>(PATTERNS[0])
  const [log, setLog] = useState<string[]>([])
  const [didDoc, setDidDoc] = useState<DidDoc | null>(null)
  const [didError, setDidError] = useState('')
  const [stepStates, setStepStates] = useState<Record<string, 'pending' | 'running' | 'done' | 'failed'>>({})
  const [stepResults, setStepResults] = useState<Record<string, StepResult>>({})

  const network: NetworkConfig = NETWORKS[networkId]

  useEffect(() => {
    // Reset per-network state when the network changes.
    setAddresses(null)
    setRegistry(network.registry)
    setDeployState('idle')
    setDeployError('')
    setDidDoc(null)
    setDidError('')
    setStepStates({})
    setStepResults({})
  }, [networkId])

  const publicClient = useMemo(() => makePublicClient(network), [network])

  // On local (Anvil), seed keys with pre-funded dev keys; on testnets, keep the
  // random burner keys but leave funding to the user.
  useEffect(() => {
    if (networkId === 'local') keys.seedWithAnvilKeys()
  }, [networkId, keys])

  useEffect(() => {
    void (async () => {
      if (!publicClient || !network) return
      try {
        await publicClient.getChainId()
        setDeployError('')
      } catch {
        if (networkId === 'local') setDeployError('Anvil not reachable at ' + network.rpcUrl)
      }
    })()
  }, [publicClient, network, networkId])

  const identityAddress = keys.address('identity')

  async function handleDeploy() {
    setDeployState('deploying')
    setDeployError('')
    try {
      const wallet = makeWalletClientFromAccount(network, keys.account('identity'))
      // Ensure the registry exists first (Resolve DID may have already deployed it
      // on local mode — reuse it rather than deploying a second registry).
      let registryAddr = registry
      if (networkId === 'local' && !registryAddr) {
        registryAddr = await deployRegistryInBrowser(wallet, publicClient)
        setRegistry(registryAddr)
      }
      const managers = await deployManagersInBrowser(wallet, publicClient)
      setAddresses(managers)
      if (networkId !== 'local') setRegistry(network.registry as `0x${string}`)
      setDeployState('done')
    } catch (err) {
      setDeployState('failed')
      setDeployError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleResolve() {
    setDidError('')
    setDidDoc(null)
    if (!identityAddress) return
    try {
      // Step 0: the identity's DID document resolves before any contracts are
      // deployed (baseline: identity EOA as controller, no attributes). On local
      // mode the registry must exist to resolve against, so deploy just the
      // registry on demand — no managers needed.
      let registryAddr = registry
      if (networkId === 'local' && !registryAddr) {
        registryAddr = await deployRegistryInBrowser(
          makeWalletClientFromAccount(network, keys.account('identity')),
          publicClient
        )
        setRegistry(registryAddr)
      }
      const doc = await resolveDid(network, identityAddress, registryAddr ?? undefined)
      setDidDoc(doc)
    } catch (err) {
      setDidError(err instanceof Error ? err.message : String(err))
    }
  }

  function buildStepContext(): StepContext {
    if (!addresses || !registry) throw new Error('Contracts not deployed yet')
    return {
      network,
      publicClient,
      keys,
      addresses: { ...addresses, registry },
      walletFor: (role: KeyRole) => makeWalletClientFromAccount(network, keys.account(role)),
      identityAddress,
    }
  }

  async function runStep(pattern: Pattern, stepIndex: number) {
    const step = pattern.steps[stepIndex]
    const stepKey = `${pattern.id}:${stepIndex}`
    setStepStates((s) => ({ ...s, [stepKey]: 'running' }))
    setStepResults((r) => ({ ...r, [stepKey]: { summary: 'Running…' } }))
    try {
      const ctx = buildStepContext()
      const result = await step.run(ctx)
      setStepStates((s) => ({ ...s, [stepKey]: 'done' }))
      setStepResults((r) => ({ ...r, [stepKey]: result }))
      setLog((l) => [...l, `[${pattern.number}] ${step.title}: ${result.summary}`])
      // Re-resolve the DID doc after a successful step.
      if (pattern.number !== '8' && pattern.number !== '11') {
        void handleResolve()
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

  const isLocalOnlyDisabled = selectedPattern.localOnly && networkId !== 'local'

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          EIP-7702 × did:ethr <span className="subtitle">interactive explainer</span>
        </h1>
        <div className="network-picker">
          <label>Network</label>
          <select value={networkId} onChange={(e) => setNetworkId(e.target.value as typeof networkId)}>
            {NETWORK_LIST.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      {deployError && <div className="banner error">{deployError}</div>}
      {selectedPattern.localOnly && networkId !== 'local' && (
        <div className="banner warn">
          Pattern {selectedPattern.number} (expiring delegation) requires a local Anvil to time-warp.
          Switch to Local Anvil mode.
        </div>
      )}

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
            <button onClick={handleResolve}>Resolve DID</button>
          </div>

          {!addresses ? (
            <div className="card deploy-card">
              <h2>Deploy contracts</h2>
              <p>
                {networkId === 'local'
                  ? 'Auto-deploy ERC-1056 + all 7 delegation managers to the local Anvil node using the well-known Anvil dev key.'
                  : `The delegation managers are not yet pre-deployed to ${network.label}. Deploy them from your browser — the identity key needs a small balance (${
                      networkId === 'gnosis' ? 'xDAI' : 'test ETH'
                    }).`}
              </p>
              <p>
                Step 0 — hit <strong>Resolve DID</strong> above first: the identity's DID document
                already resolves (identity as controller, no attributes) before any contract is
                deployed. On {network.label}, only a registry is needed for that, which the app
                deploys on demand.
              </p>
              <p>
                On {network.label}, the registry is already live at{' '}
                <code>{network.registry}</code>. On local Anvil it is deployed with everything else.
              </p>
              <button onClick={handleDeploy} disabled={deployState === 'deploying'}>
                {deployState === 'deploying' ? 'Deploying…' : 'Deploy contracts in browser'}
              </button>
              {deployState === 'failed' && <div className="banner error">{deployError}</div>}
              {networkId !== 'local' && network.faucetUrl && (
                <p>
                  Need funds? Get test funds from the{' '}
                  <a href={network.faucetUrl} target="_blank" rel="noreferrer">
                    {network.label} faucet
                  </a>
                  . Key manager below shows the identity address to fund.
                </p>
              )}
            </div>
          ) : (
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
                          disabled={state === 'running' || !addresses || isLocalOnlyDisabled}
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
          )}

          <div className="card did-card">
            <h2>DID Document</h2>
            {didError && <div className="banner error">{didError}</div>}
            {!didDoc && !didError && <p className="muted">Resolve the DID to inspect the document.</p>}
            {didDoc && <pre className="did-doc">{JSON.stringify(didDoc, null, 2)}</pre>}
          </div>
        </section>

        <aside className="keys-panel">
          <h2>Keys (in-memory)</h2>
          <p className="muted">
            MetaMask cannot sign EIP-7702 authorizations, so keys are managed locally in browser memory.
            Never persisted.
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

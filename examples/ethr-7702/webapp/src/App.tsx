import { useEffect, useMemo, useState } from 'react'
import { NETWORKS, NETWORK_LIST, type NetworkConfig } from './config/chains'
import { KeyManager, KEY_ROLES, type KeyRole } from './lib/keys'
import {
  makePublicClient,
  makeWalletClientFromAccount,
  makeAnvilBroadcasterClient,
  makeInjectedWalletClient,
  requestAccounts,
  injectedProvider,
  type EIP1193Provider,
} from './lib/clients'
import { deployManagersInBrowser, deployRegistryInBrowser } from './lib/deploy'
import { type ManagerAddresses } from './lib/deployed'
import { resolveDid, type DidDoc } from './lib/resolve'
import { PATTERNS, type Pattern } from './patterns/registry'
import type { StepContext, StepResult } from './patterns/types'
import type { WalletClient, Address } from 'viem'

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
  const [connectedAccount, setConnectedAccount] = useState<Address | null>(null)
  const [walletError, setWalletError] = useState('')

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
    setConnectedAccount(null)
    setWalletError('')
  }, [networkId])

  const publicClient = useMemo(() => makePublicClient(network), [network])

  // On local (Anvil), seed keys with pre-funded dev keys; on testnets, keep the
  // persisted burner keys but leave funding to the user.
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

  /**
   * The gas payer: on local (Anvil) a dedicated fixed dev key; on testnets the
   * connected injected wallet. Always an account that is NOT the identity EOA.
   */
  const broadcaster: WalletClient = useMemo(() => {
    if (networkId === 'local') return makeAnvilBroadcasterClient(network)
    const provider = injectedProvider()
    if (provider && connectedAccount) return makeInjectedWalletClient(network, provider, connectedAccount)
    // Fallback never used for sending (guarded by UI); keep a no-op local client.
    return makeAnvilBroadcasterClient(network)
  }, [networkId, network, connectedAccount])

  const broadcasterAddress: Address | null =
    networkId === 'local' ? broadcaster.account?.address ?? null : connectedAccount

  async function handleConnectWallet() {
    setWalletError('')
    const provider = injectedProvider() as EIP1193Provider | null
    if (!provider) {
      setWalletError('No injected wallet detected. Install MetaMask or Rabby, or switch to Local Anvil mode.')
      return
    }
    try {
      const accounts = await requestAccounts(provider)
      if (accounts.length === 0) {
        setWalletError('Wallet did not return any accounts.')
        return
      }
      setConnectedAccount(accounts[0])
      setLog((l) => [...l, `[network] connected wallet ${short(accounts[0])} — will pay gas on ${network.label}`])
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDeploy() {
    setDeployState('deploying')
    setDeployError('')
    try {
      // The broadcaster pays for deployments too — the identity key stays gasless.
      const wallet = broadcaster
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
      let registryAddr = registry
      if (networkId === 'local' && !registryAddr) {
        registryAddr = await deployRegistryInBrowser(broadcaster, publicClient)
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
    if (!broadcasterAddress) throw new Error('No broadcaster available — connect a wallet on testnets')
    return {
      network,
      publicClient,
      keys,
      addresses: { ...addresses, registry },
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
  const testnetNeedsWallet = networkId !== 'local' && !connectedAccount

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
      {walletError && <div className="banner error">{walletError}</div>}
      {testnetNeedsWallet && (
        <div className="banner warn">
          <span>
            Connect your wallet to pay gas on {network.label}. The identity EOA (a local key) stays
            gasless.
          </span>
          <button className="btn-action" onClick={handleConnectWallet}>
            Connect wallet to pay gas
          </button>
        </div>
      )}
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
                  ? 'Auto-deploy ERC-1056 + all 7 delegation managers to the local Anvil node using the dedicated Anvil broadcaster key.'
                  : `The delegation managers are not yet pre-deployed to ${network.label}. Deploy them from your browser — the connected wallet pays the gas.`}
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
              {networkId !== 'local' ? (
                connectedAccount ? (
                  <button onClick={handleDeploy} disabled={deployState === 'deploying'}>
                    {deployState === 'deploying' ? 'Deploying…' : 'Deploy contracts (broadcaster pays)'}
                  </button>
                ) : (
                  <button onClick={handleConnectWallet}>Connect wallet to pay gas</button>
                )
              ) : (
                <button onClick={handleDeploy} disabled={deployState === 'deploying'}>
                  {deployState === 'deploying' ? 'Deploying…' : 'Deploy contracts in browser'}
                </button>
              )}
              {deployState === 'failed' && <div className="banner error">{deployError}</div>}
              {networkId !== 'local' && network.faucetUrl && (
                <p>
                  Need funds for the broadcaster? Get test funds from the{' '}
                  <a href={network.faucetUrl} target="_blank" rel="noreferrer">
                    {network.label} faucet
                  </a>
                  . The broadcaster (below) is the address to fund.
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
                          disabled={state === 'running' || !addresses || testnetNeedsWallet || isLocalOnlyDisabled}
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
          <h2>DID keys (local)</h2>
          <p className="muted">
            MetaMask cannot sign EIP-7702 authorizations, so the DID subject's keys are managed
            locally and persisted to localStorage. They never pay gas.
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
              <code>
                {networkId === 'local'
                  ? short(broadcasterAddress ?? undefined)
                  : connectedAccount
                    ? short(connectedAccount)
                    : 'not connected'}
              </code>
            </div>
            {networkId !== 'local' && (
              <div className="key-actions">
                {connectedAccount ? (
                  <button title="Connected" className="btn-wide" disabled>
                    ✓ Connected
                  </button>
                ) : (
                  <button title="Connect wallet to pay gas" className="btn-wide" onClick={handleConnectWallet}>
                    Connect wallet
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="key-actions panel-actions">
            <button title="Reset keyring (new random keys)" className="btn-wide" onClick={() => keys.reset()}>
              Reset keys
            </button>
          </div>
          {networkId !== 'local' && (
            <p className="muted">
              Note: MetaMask currently restricts type-4 (EIP-7702) transactions to its own blessed
              delegates. On testnets use a wallet that allows arbitrary delegated-code type-4 txs.
            </p>
          )}
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

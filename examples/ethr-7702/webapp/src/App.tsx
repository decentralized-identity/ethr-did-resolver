import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NETWORKS, NETWORK_LIST, type NetworkConfig } from './config/chains'
import { KeyManager, KEY_ROLES, type KeyRole, isWellKnownKey } from './lib/keys'
import {
  makePublicClient,
  makeWalletClientFromAccount,
  makeAnvilBroadcasterClient,
  makeInjectedWalletClient,
  makeTrackingWalletClient,
  getSentTxs,
  requestAccounts,
  injectedProvider,
  type EIP1193Provider,
} from './lib/clients'
import { detectType4Support, detectWalletBrand, verifyMinedType4, type Type4Support } from './lib/type4'
import { deterministicManagerAddresses, deployManagerInBrowser, deployRegistryInBrowser, MANAGER_META } from './lib/deploy'
import { isDeployed } from './lib/create2'
import type { ManagerKey } from './lib/deployed'
import { waitForBlockVisible, waitUntilDeployed } from './lib/rpcLag'
import { resolveDid, type DidDoc } from './lib/resolve'
import { PATTERNS, type Pattern } from './patterns/registry'
import type { StepContext, StepResult } from './patterns/types'
import type { WalletClient, Address } from 'viem'

function short(addr: string | undefined): string {
  if (!addr) return '—'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

type DeployState = 'idle' | 'deploying' | 'failed'

function App() {
  const [networkId, setNetworkId] = useState<'local' | 'sepolia' | 'gnosis'>('local')
  const [keys] = useState(() => new KeyManager())
  // Manager addresses are DETERMINISTIC (CREATE2) — computed once, chain-independent.
  // Whether a manager actually has code on the current network is tracked separately.
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
  const [connectedAccount, setConnectedAccount] = useState<Address | null>(null)
  const [walletError, setWalletError] = useState('')
  // The testnet broadcaster is the connected injected wallet — but only if it
  // supports EIP-7702 type-4 txs (detected on connect). MetaMask-class wallets
  // silently strip the authorizationList, so they are blocked.
  const [provider, setProvider] = useState<EIP1193Provider | null>(null)
  const [type4Support, setType4Support] = useState<Type4Support | null>(null)
  const [detectingSupport, setDetectingSupport] = useState(false)
  // Monotonic counter guarding against out-of-order resolve responses: if a
  // slower, earlier resolveDid() call finishes after a newer one, its result
  // must be discarded rather than clobbering the fresher document.
  const resolveGeneration = useRef(0)

  const network: NetworkConfig = NETWORKS[networkId]
  const publicClient = useMemo(() => makePublicClient(network), [network])

  useEffect(() => {
    // Reset per-network state when the network changes.
    setRegistry(network.registry)
    setDeployedManagers(new Set())
    setManagerDeployState({})
    setRegistryDeployState('idle')
    setDeployError('')
    setDidDoc(null)
    setDidError('')
    setStepStates({})
    setStepResults({})
    setConnectedAccount(null)
    setWalletError('')
  }, [networkId, network.registry])

  // On local (Anvil), seed keys with pre-funded dev keys; on testnets, keep the
  // persisted burner keys.
  useEffect(() => {
    if (networkId === 'local') keys.seedWithAnvilKeys()
  }, [networkId, keys])

  // On testnets, once a wallet is connected, probe whether it supports EIP-7702
  // type-4 transactions. Injected wallets that don't silently strip the
  // authorization and mine a legacy no-op, so non-supporting wallets are blocked.
  useEffect(() => {
    if (networkId === 'local' || !connectedAccount) {
      setType4Support(null)
      return
    }
    const provider = injectedProvider() as EIP1193Provider | null
    if (!provider) return
    setProvider(provider)
    setDetectingSupport(true)
    let stale = false
    void detectType4Support(provider)
      .then((support) => {
        if (stale) return
        setType4Support(support)
        setLog((l) => [...l, `[wallet] EIP-7702 type-4 support: ${support} (${detectWalletBrand(provider)})`])
      })
      .finally(() => {
        if (!stale) setDetectingSupport(false)
      })
    return () => {
      stale = true
    }
  }, [connectedAccount, networkId])

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
   * Check which of the SELECTED pattern's required contracts already have
   * code on the current network. Only checks what the pattern actually
   * needs — this is the "ask for deployment only then" check.
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

   /**
    * The gas payer. ALWAYS an account that is NOT the identity EOA.
    * - local (Anvil): a dedicated fixed dev key
    * - testnet: the connected injected wallet — but only used once detection
    *   says it supports EIP-7702 type-4 txs (see type4.ts). Wrapped so every
    *   sent tx is recorded (makeTrackingWalletClient) for post-hoc verification
    *   that the mined tx really is 0x04 and the auth wasn't stripped.
    */
   const broadcaster: WalletClient | null = useMemo(() => {
     if (networkId === 'local') return makeAnvilBroadcasterClient(network)
     if (connectedAccount && provider) {
       return makeTrackingWalletClient(makeInjectedWalletClient(network, provider, connectedAccount))
     }
     return null
   }, [networkId, network, connectedAccount, provider])

   const broadcasterAddress: Address | null = broadcaster?.account?.address ?? null

  async function handleConnectWallet() {
    setWalletError('')
    const provider = injectedProvider() as EIP1193Provider | null
    if (!provider) {
      setWalletError('No injected wallet detected. Install Rabby (EIP-7702 support) or switch to Local Anvil mode.')
      return
    }
    try {
      const accounts = await requestAccounts(provider)
      if (accounts.length === 0) {
        setWalletError('Wallet did not return any accounts.')
        return
      }
      setProvider(provider)
      setConnectedAccount(accounts[0])
      setLog((l) => [...l, `[network] connected wallet ${short(accounts[0])} — will pay gas on ${network.label}`])
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDeployManager(key: ManagerKey) {
    setDeployError('')
    setManagerDeployState((s) => ({ ...s, [key]: 'deploying' }))
    try {
      if (!broadcaster) throw new Error('No broadcaster available — connect a type-4-capable wallet on testnets')
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
      if (!broadcaster) throw new Error('No broadcaster available — connect a type-4-capable wallet on testnets')
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
    if (selectedPattern.needsRegistry && networkId === 'local' && !registry) await handleDeployRegistry()
  }

  /**
   * Resolve the DID document. `minBlock`, when passed, makes this wait for the
   * RPC endpoint to catch up to that block before querying — see
   * `waitForBlockVisible` for why this matters on public testnet RPCs. A
   * generation counter discards out-of-order responses (e.g. a slow resolve
   * finishing after a newer one started).
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
      if (networkId === 'local' && !registryAddr) {
        if (!broadcaster) throw new Error('No broadcaster available — connect a type-4-capable wallet on testnets')
        registryAddr = await deployRegistryInBrowser(broadcaster, publicClient)
        setRegistry(registryAddr)
      }
      if (minBlock !== undefined) await waitForBlockVisible(publicClient, minBlock)
      const doc = await resolveDid(network, identityAddress, registryAddr ?? undefined)
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
    if (!broadcaster || !broadcasterAddress) {
      throw new Error('No broadcaster available — connect a type-4-capable wallet on testnets')
    }
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
      const sentBefore = getSentTxs(broadcaster!).length
      const result = await step.run(ctx)
      setStepStates((s) => ({ ...s, [stepKey]: 'done' }))
      setStepResults((r) => ({ ...r, [stepKey]: result }))
      setLog((l) => [...l, `[${pattern.number}] ${step.title}: ${result.summary}`])
      // Ground-truth check on testnets: if this step broadcast a type-4 tx, the
      // MINED tx must really be 0x04. A wallet that doesn't support EIP-7702
      // silently strips the authorization and mines a legacy no-op — caught here
      // regardless of what detection guessed.
      if (networkId !== 'local' && result.txHash) {
        const sent = getSentTxs(broadcaster!).slice(sentBefore)
        const type4 = sent.some((s) => s.hash === result.txHash && s.type4)
        if (type4) {
          const verification = await verifyMinedType4(publicClient, result.txHash)
          if (!verification.ok) {
            setWalletError(`EIP-7702 broadcast failed: ${verification.reason}. Switch to a type-4-capable wallet (e.g. Rabby).`)
          }
        }
      }
      // Re-resolve the DID doc after a successful step. If the step broadcast a
      // tx, wait for the RPC's own view of the chain to reach that tx's block
      // before reading — otherwise a public-RPC read can race the write (see
      // waitForBlockVisible).
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

  const isLocalOnlyDisabled = selectedPattern.localOnly && networkId !== 'local'
  const broadcasterReady =
    networkId === 'local' ||
    (connectedAccount !== null && type4Support !== null && type4Support !== 'unsupported')
  const missingManagers = selectedPattern.requires.filter((key) => !deployedManagers.has(key))
  const registryReady = !selectedPattern.needsRegistry || Boolean(registry)
  const contractsReady = missingManagers.length === 0 && registryReady
  const walletBrand = provider ? detectWalletBrand(provider) : null

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
      {networkId !== 'local' && !connectedAccount && (
        <div className="banner warn">
          <span>
            Connect a wallet to pay gas on {network.label}. The wallet must support EIP-7702 type-4
            transactions (Rabby does; MetaMask silently drops the authorization and DID updates would
            not appear). The identity EOA (a local key) stays gasless.
          </span>
          <button className="btn-action" onClick={handleConnectWallet}>
            Connect wallet
          </button>
        </div>
      )}
      {networkId !== 'local' && connectedAccount && detectingSupport && (
        <div className="banner warn">
          <span>Checking whether your wallet supports EIP-7702 type-4 transactions…</span>
        </div>
      )}
      {networkId !== 'local' && connectedAccount && type4Support === 'unsupported' && (
        <div className="banner error">
          <span>
            Your wallet ({walletBrand}) does not support EIP-7702 type-4 transactions — it would
            silently strip the authorization and DID updates would not appear. Switch to a
            type-4-capable wallet such as Rabby, or use Local Anvil mode.
          </span>
        </div>
      )}
      {networkId !== 'local' && connectedAccount && type4Support === 'unknown' && (
        <div className="banner warn">
          <span>
            Couldn't verify EIP-7702 type-4 support in this wallet. You can try a run — the app verifies
            each mined transaction and will flag it if the authorization was stripped.
          </span>
        </div>
      )}
      {selectedPattern.localOnly && networkId !== 'local' && (
        <div className="banner warn">
          Pattern {selectedPattern.number} (expiring delegation) requires a local Anvil to time-warp.
          Switch to Local Anvil mode.
        </div>
      )}
      {networkId !== 'local' && isWellKnownKey(identityAddress) && (
        <div className="banner warn">
          The identity EOA <code>{short(identityAddress)}</code> is a shared Anvil dev key. On{' '}
          {network.label} these public keys have huge nonces and may already hold a leftover delegation, so
          EIP-7702 authorizations are silently skipped and DID updates will not appear. Click{' '}
          <strong>Reset keys</strong> to use a fresh, private identity, then re-run.
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
            <button onClick={() => handleResolve()} disabled={resolving}>
              {resolving ? 'Resolving…' : 'Resolve DID'}
            </button>
          </div>

          <div className="card contracts-card">
            <h2>Contracts for Pattern {selectedPattern.number}</h2>
            <p className="muted">
              Every manager has a deterministic CREATE2 address — the same on Anvil, Sepolia, and
              Gnosis. Only the contract(s) this pattern actually calls are checked and, if missing,
              deployed here — nothing else.
            </p>
            {checkingContracts && <p className="muted">Checking on-chain state…</p>}
            {selectedPattern.needsRegistry && (
              <div className="contract-row">
                <div>
                  <strong>Registry (ERC-1056)</strong>
                  <code>{registry ?? (networkId === 'local' ? 'not deployed' : network.registry)}</code>
                </div>
                {registry ? (
                  <span className="ok">✓ deployed</span>
                ) : networkId === 'local' ? (
                  <button onClick={handleDeployRegistry} disabled={registryDeployState === 'deploying'}>
                    {registryDeployState === 'deploying' ? 'Deploying…' : 'Deploy registry'}
                  </button>
                ) : (
                  <span className="muted">pre-deployed on {network.label}</span>
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
                    <button
                      onClick={() => handleDeployManager(key)}
                      disabled={state === 'deploying' || (networkId !== 'local' && !broadcasterReady)}
                    >
                      {state === 'deploying' ? 'Deploying…' : `Deploy ${meta.label}`}
                    </button>
                  )}
                </div>
              )
            })}
            {!contractsReady && (missingManagers.length > 0 || (selectedPattern.needsRegistry && !registry)) && (
              <button className="btn-wide" onClick={handleDeployMissing} disabled={networkId !== 'local' && !broadcasterReady}>
                Deploy all missing for this pattern
              </button>
            )}
            {networkId !== 'local' && network.faucetUrl && !contractsReady && (
              <p>
                Your wallet needs test ETH to pay gas — get some from the{' '}
                <a href={network.faucetUrl} target="_blank" rel="noreferrer">
                  {network.label} faucet
                </a>
                .
              </p>
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
                        disabled={state === 'running' || !contractsReady || !broadcasterReady || isLocalOnlyDisabled}
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
            {resolving && (
              <p className="muted">
                Resolving… {networkId !== 'local' && 'public RPCs can take a few seconds to catch up after a write.'}
              </p>
            )}
            {!didDoc && !didError && !resolving && <p className="muted">Resolve the DID to inspect the document.</p>}
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
              <code>{short(broadcasterAddress ?? undefined)}</code>
            </div>
            {networkId !== 'local' && (
              <div className="key-actions broadcaster-actions">
                {!connectedAccount ? (
                  <button title="Connect a wallet that will pay gas" className="btn-wide" onClick={handleConnectWallet}>
                    Connect wallet
                  </button>
                ) : type4Support === 'supported' ? (
                  <span className="ok">✓ EIP-7702 type-4 supported</span>
                ) : type4Support === 'unsupported' ? (
                  <span className="badge warn">no EIP-7702 type-4 support — use Rabby</span>
                ) : type4Support === 'unknown' ? (
                  <span className="muted">type-4 support unverified (will check mined txs)</span>
                ) : (
                  <span className="muted">checking type-4 support…</span>
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
              The broadcaster is your connected wallet. It must support EIP-7702 type-4 transactions
              (Rabby does; MetaMask silently drops the authorization list). The identity EOA stays
              gasless.
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

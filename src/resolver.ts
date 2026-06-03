import { BlockTag, encodeBase58, encodeBase64, getAddress, toUtf8String } from 'ethers'
import { ConfigurationOptions, ConfiguredNetworks, MultiProviderConfiguration, configureResolverWithNetworks } from './configuration.js'
import { EthrDidCache, InMemoryEthrDidCache } from './cache.js'
import type {
  ContextEntry,
  DIDDocument,
  DIDResolutionOptions,
  DIDResolutionResult,
  DIDResolver,
  ParsedDID,
  Resolvable,
  Service,
  VerificationMethod,
} from 'did-resolver'
import {
  algoToVMType,
  CanonicalDIDEvent,
  secp256k1ToJwk,
  Errors,
  ExtendedVerificationMethod,
  identifierMatcher,
  interpretIdentifier,
  multicodecPrefixes,
  nullAddress,
  strip0x,
  toMultibase,
  VMTypes,
} from './helpers.js'
import { logDecoder } from './logParser.js'

/**
 * Builds the JSON-LD @context array for a DID document based on the verification method types
 * and key encoding properties actually present in the document.
 *
 * - Always includes the base DID v1 and secp256k1recovery-2020/v2 contexts.
 * - Adds suite-specific contexts only for key types present in the document.
 * - Appends an inline term definition object for any terms not covered by the above contexts
 *   (publicKeyHex, publicKeyJwk).
 */
function buildLdContext(didDocument: DIDDocument): ContextEntry[] {
  const contexts: ContextEntry[] = [
    'https://www.w3.org/ns/did/v1',
    // defines EcdsaSecp256k1RecoveryMethod2020, blockchainAccountId
    'https://w3id.org/security/suites/secp256k1recovery-2020/v2',
  ]

  const allVMs: VerificationMethod[] = didDocument.verificationMethod ?? []

  const types = new Set(allVMs.map((vm) => vm.type))
  const hasPublicKeyHex = allVMs.some((vm) => 'publicKeyHex' in vm)
  const hasPublicKeyJwk = allVMs.some((vm) => 'publicKeyJwk' in vm)
  const hasPublicKeyBase58 = allVMs.some((vm) => 'publicKeyBase58' in vm)
  const hasPublicKeyBase64 = allVMs.some((vm) => 'publicKeyBase64' in vm)

  // security/v2 defines EcdsaSecp256k1VerificationKey2019 & publicKeyBase58
  if (types.has(VMTypes.EcdsaSecp256k1VerificationKey2019) || hasPublicKeyBase58) {
    contexts.push('https://w3id.org/security/v2')
  }

  if (types.has(VMTypes.Ed25519VerificationKey2020)) {
    contexts.push('https://w3id.org/security/suites/ed25519-2020/v1')
  }

  if (types.has(VMTypes.X25519KeyAgreementKey2020)) {
    contexts.push('https://w3id.org/security/suites/x25519-2020/v1')
  }

  if (types.has(VMTypes.Multikey)) {
    contexts.push('https://w3id.org/security/multikey/v1')
  }

  // Inline term definitions for properties not defined by any of the above contexts.
  const securityV2Included = contexts.includes('https://w3id.org/security/v2')
  const inline: Record<string, unknown> = {}
  if (hasPublicKeyHex) {
    inline['publicKeyHex'] = 'https://w3id.org/security#publicKeyHex'
  }
  if (hasPublicKeyJwk) {
    inline['publicKeyJwk'] = { '@id': 'https://w3id.org/security#publicKeyJwk', '@type': '@json' }
  }
  // publicKeyBase58 is defined by security/v2; only add inline if that context is absent.
  if (hasPublicKeyBase58 && !securityV2Included) {
    inline['publicKeyBase58'] = 'https://w3id.org/security#publicKeyBase58'
  }
  // publicKeyBase64 is not defined by any suite context — always inline when present.
  if (hasPublicKeyBase64) {
    inline['publicKeyBase64'] = 'https://w3id.org/security#publicKeyBase64'
  }
  if (Object.keys(inline).length > 0) {
    contexts.push(inline)
  }

  return contexts
}

export function getResolver(options: ConfigurationOptions): Record<string, DIDResolver> {
  return new EthrDidResolver(options).build()
}

export class EthrDidResolver {
  private readonly contracts: ConfiguredNetworks
  private readonly cache: EthrDidCache

  constructor(options: ConfigurationOptions) {
    this.contracts = configureResolverWithNetworks(options)
    this.cache = (options as MultiProviderConfiguration).cache ?? new InMemoryEthrDidCache()
  }

  /**
   * Returns the block number with the previous change to a particular address (DID)
   *
   * @param address - the address (DID) to check for changes
   * @param networkId - the EVM network to check
   * @param blockTag - the block tag to use for the query (default: 'latest')
   */
  async previousChange(address: string, networkId: string, blockTag?: BlockTag): Promise<bigint> {
    return await this.contracts[networkId].changed(address, { blockTag })
  }

  async getBlockMetadata(blockHeight: number, networkId: string): Promise<{ height: string; timestamp: number }> {
    const networkContract = this.contracts[networkId]
    if (!networkContract) throw new Error(`No contract configured for network ${networkId}`)
    if (!networkContract.runner) throw new Error(`No runner configured for contract with network ${networkId}`)
    if (!networkContract.runner.provider)
      throw new Error(`No provider configured for runner in contract with network ${networkId}`)
    const block = await networkContract.runner.provider.getBlock(blockHeight)
    if (!block) throw new Error(`Block at height ${blockHeight} not found`)
    return { height: block.number.toString(), timestamp: block.timestamp }
  }

  async changeLog(
    identity: string,
    networkId: string,
    blockTag: BlockTag = 'latest'
  ): Promise<{ address: string; history: CanonicalDIDEvent[]; controllerKey?: string; chainId: number }> {
    const contract = this.contracts[networkId]
    if (!contract) throw new Error(`No contract configured for network ${networkId}`)
    if (!contract.runner) throw new Error(`No runner configured for contract with network ${networkId}`)
    if (!contract.runner.provider)
      throw new Error(`No provider configured for runner in contract with network ${networkId}`)
    const provider = contract.runner.provider
    const chainId = Number((await provider.getNetwork()).chainId)
    const registryAddress = (await contract.getAddress()).toLowerCase()
    const history: CanonicalDIDEvent[] = []
    const { address, publicKey } = interpretIdentifier(identity)
    const controllerKey = publicKey

    let previousChange = Number(await this.previousChange(address, networkId, blockTag))

    // Short-circuit: no history, no RPC calls for finality
    if (previousChange === 0) {
      return { address, history: [], controllerKey, chainId }
    }

    // Lazy finality — determined at most once per changeLog call, only on a cache miss
    let finalizedBlockNumber: number | undefined
    const getFinalizedBlockNumber = async (): Promise<number> => {
      if (finalizedBlockNumber !== undefined) return finalizedBlockNumber
      try {
        const finalized = await provider.getBlock('finalized')
        if (finalized?.number !== undefined) {
          finalizedBlockNumber = finalized.number
          return finalizedBlockNumber
        }
      } catch {
        // RPC does not support the 'finalized' block tag; use conservative fallback.
      }
      const latest = Number(await provider.getBlockNumber())
      finalizedBlockNumber = Math.max(0, latest - 512)
      return finalizedBlockNumber
    }

    while (previousChange !== 0) {
      const blockNumber = previousChange

      // 1. Cache check
      const cached = await this.cache.getEvents(chainId, registryAddress, address, blockNumber)
      if (cached !== undefined) {
        // Derive chain pointer from cached events (same guard as logDecoder)
        let chainPointer = 0
        for (const event of cached) {
          const pc = event.previousChange
          if (pc > 0 && pc < blockNumber && (chainPointer === 0 || pc < chainPointer)) {
            chainPointer = pc
          }
        }
        previousChange = chainPointer
        for (const event of [...cached].reverse()) {
          history.unshift(event)
        }
        continue
      }

      // 2. Cache miss: fetch logs and block in parallel
      const [logs, block] = await Promise.all([
        provider.getLogs({
          address: registryAddress,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          topics: [null as any, `0x000000000000000000000000${address.slice(2)}`],
          fromBlock: blockNumber,
          toBlock: blockNumber,
        }),
        provider.getBlock(blockNumber),
      ])

      if (logs.length === 0) {
        throw new Error(
          `No logs found for block ${blockNumber} but previousChange points here. ` +
            `The RPC node may not have historical log data. Use an archive node for complete DID resolution.`
        )
      }
      if (!block) {
        throw new Error(`Block ${blockNumber} not found.`)
      }

      // 3. Decode
      const { events, previousChange: pc } = logDecoder(
        contract,
        logs,
        blockNumber,
        block.timestamp,
        chainId,
        registryAddress
      )

      // 4. Write to cache only if this block is finalized (lazy finality check)
      const finalized = await getFinalizedBlockNumber()
      if (blockNumber <= finalized) {
        for (const event of events) {
          await this.cache.setEvent(event)
        }
        await this.cache.setBlockMetadata(chainId, blockNumber, {
          height: block.number.toString(),
          timestamp: block.timestamp,
        })
      }

      previousChange = pc
      events.reverse()
      for (const event of events) {
        history.unshift(event)
      }
    }

    return { address, history, controllerKey, chainId }
  }

  wrapDidDocument(
    did: string,
    address: string,
    controllerKey: string | undefined,
    history: CanonicalDIDEvent[],
    chainId: number,
    blockHeight: string | number,
    now: number
  ): { didDocument: DIDDocument; deactivated: boolean; versionId: number; nextVersionId: number } {
    const baseDIDDocument: DIDDocument = {
      id: did,
      verificationMethod: [],
      authentication: [],
      assertionMethod: [],
    }

    let controller = address

    const authentication = [`${did}#controller`]
    const assertionMethod = [`${did}#controller`]

    let versionId = 0
    let nextVersionId = Number.POSITIVE_INFINITY
    let deactivated = false
    let delegateCount = 0
    let serviceCount = 0
    const auth: Record<string, string> = {}
    const keyAgreementRefs: Record<string, string> = {}
    const signingRefs: Record<string, string> = {}
    const pks: Record<string, VerificationMethod> = {}
    const services: Record<string, Service> = {}
    if (typeof blockHeight === 'string') {
      // latest
      blockHeight = -1
    }
    for (const event of history) {
      if (blockHeight !== -1 && event.blockNumber > blockHeight) {
        if (nextVersionId > event.blockNumber) {
          nextVersionId = event.blockNumber
        }
        continue
      } else {
        if (versionId < event.blockNumber) {
          versionId = event.blockNumber
        }
      }
      if (event.eventType === 'DIDOwnerChanged') {
        controller = event.owner
        if (event.owner === nullAddress) {
          deactivated = true
          break
        }
      } else if (event.eventType === 'DIDDelegateChanged') {
        const eventIndex = `${event.eventType}-${event.delegateType}-${event.delegate}`
        delegateCount++
        if (event.validTo >= now) {
          // addition
          const delegateType = event.delegateType //conversion from bytes32 is done in logParser
          // noinspection FallThroughInSwitchStatementJS
          switch (delegateType) {
            case 'sigAuth':
              auth[eventIndex] = `${did}#delegate-${delegateCount}`
            // intentionally fall through. Authoritative keys can also make assertions.
            case 'veriKey':
              pks[eventIndex] = {
                id: `${did}#delegate-${delegateCount}`,
                type: VMTypes.EcdsaSecp256k1RecoveryMethod2020,
                controller: did,
                blockchainAccountId: `eip155:${chainId}:${getAddress(event.delegate)}`,
              }
              signingRefs[eventIndex] = `${did}#delegate-${delegateCount}`
              break
          }
        } else {
          // revocation
          delete auth[eventIndex]
          delete signingRefs[eventIndex]
          delete pks[eventIndex]
        }
      } else if (event.eventType === 'DIDAttributeChanged') {
        const eventIndex = `${event.eventType}-${event.name}-${event.value}`

        if (/^did\/pub\//.test(event.name)) delegateCount++
        else if (/^did\/svc\//.test(event.name)) serviceCount++

        const match = event.name.match(/^did\/(pub|svc)\/(\w+)(\/(\w+))?(\/(\w+))?$/)
        if (match) {
          const section = match[1]
          const algorithm = match[2]
          const encoding = match[6]
          switch (section) {
            case 'pub': {
              // addition
              if (event.validTo >= now) {
                // Primary lookup: algorithm token → canonical VM type.
                // Unknown/future key types pass through as-is.
                const vmType = algoToVMType[algorithm] ?? algorithm
                const pk: ExtendedVerificationMethod = {
                  id: `${did}#delegate-${delegateCount}`,
                  type: vmType,
                  controller: did,
                }
                switch (pk.type) {
                  case VMTypes.EcdsaSecp256k1VerificationKey2019:
                    // Spec mandates publicKeyJwk for Secp256k1 attribute keys regardless of encoding hint.
                    pk.publicKeyJwk = secp256k1ToJwk(event.value)
                    break
                  case VMTypes.Ed25519VerificationKey2020:
                  case VMTypes.X25519KeyAgreementKey2020:
                    // Always produce publicKeyMultibase regardless of encoding hint, to match spec.
                    pk.publicKeyMultibase = toMultibase(event.value, multicodecPrefixes[pk.type])
                    break
                  case VMTypes.Multikey:
                    // On-chain value already includes the multicodec prefix; just base58btc-encode.
                    pk.publicKeyMultibase = toMultibase(event.value)
                    break
                  default:
                    // Unknown key types: honor the encoding hint for legacy compat.
                    switch (encoding) {
                      case null:
                      case undefined:
                      case 'hex':
                        // noinspection JSDeprecatedSymbols
                        pk.publicKeyHex = strip0x(event.value)
                        break
                      case 'base64':
                        // noinspection JSDeprecatedSymbols
                        pk.publicKeyBase64 = encodeBase64(event.value)
                        break
                      case 'base58':
                        // noinspection JSDeprecatedSymbols
                        pk.publicKeyBase58 = encodeBase58(event.value)
                        break
                      default:
                        pk.value = strip0x(event.value)
                    }
                }
                pks[eventIndex] = pk
                if (match[4] === 'sigAuth') {
                  auth[eventIndex] = pk.id
                  signingRefs[eventIndex] = pk.id
                } else if (match[4] === 'enc') {
                  keyAgreementRefs[eventIndex] = pk.id
                } else {
                  signingRefs[eventIndex] = pk.id
                }
              } else {
                // revocation
                delete pks[eventIndex]
                delete auth[eventIndex]
                delete signingRefs[eventIndex]
                delete keyAgreementRefs[eventIndex]
              }
              break
            }
            case 'svc': {
              let encodedService: string | null = null
              try {
                encodedService = toUtf8String(event.value)
              } catch {
                // value is not valid UTF-8; skip this service — non-DID use of registry
              }
              if (encodedService !== null) {
                let endpoint
                try {
                  endpoint = JSON.parse(encodedService)
                } catch {
                  endpoint = encodedService
                }
                if (event.validTo >= now) {
                  // addition
                  services[eventIndex] = {
                    id: `${did}#service-${serviceCount}`,
                    type: algorithm,
                    serviceEndpoint: endpoint,
                  }
                } else {
                  // revocation
                  delete services[eventIndex]
                }
              }
              break
            }
          }
        }
      }
    }

    const publicKeys: VerificationMethod[] = [
      {
        id: `${did}#controller`,
        type: VMTypes.EcdsaSecp256k1RecoveryMethod2020,
        controller: did,
        blockchainAccountId: `eip155:${chainId}:${getAddress(controller)}`,
      },
    ]

    if (controllerKey && controller == address) {
      publicKeys.push({
        id: `${did}#controllerKey`,
        type: VMTypes.EcdsaSecp256k1VerificationKey2019,
        controller: did,
        publicKeyJwk: secp256k1ToJwk(controllerKey),
      })
      authentication.push(`${did}#controllerKey`)
      assertionMethod.push(`${did}#controllerKey`)
    }

    const didDocument: DIDDocument = {
      ...baseDIDDocument,
      verificationMethod: publicKeys.concat(Object.values(pks)),
      authentication: authentication.concat(Object.values(auth)),
      assertionMethod: assertionMethod.concat(Object.values(signingRefs)),
    }
    if (Object.values(services).length > 0) {
      didDocument.service = Object.values(services)
    }
    if (Object.values(keyAgreementRefs).length > 0) {
      didDocument.keyAgreement = Object.values(keyAgreementRefs)
    }

    return deactivated
      ? {
          didDocument: baseDIDDocument,
          deactivated,
          versionId,
          nextVersionId,
        }
      : { didDocument, deactivated, versionId, nextVersionId }
  }

  async resolve(
    did: string,
    parsed: ParsedDID,
    _unused: Resolvable,
    options: DIDResolutionOptions
  ): Promise<DIDResolutionResult> {
    let wantLdContext = false
    if (options.accept === 'application/did+json') {
      wantLdContext = false
    } else if (options.accept === 'application/did+ld+json' || typeof options.accept !== 'string') {
      wantLdContext = true
    } else {
      return {
        didResolutionMetadata: {
          error: Errors.unsupportedFormat,
          message: `The DID resolver does not support the requested 'accept' format: ${options.accept}`,
        },
        didDocumentMetadata: {},
        didDocument: null,
      }
    }

    const fullId = parsed.id.match(identifierMatcher)
    if (!fullId) {
      return {
        didResolutionMetadata: {
          error: Errors.invalidDid,
          message: `Not a valid did:ethr: ${parsed.id}`,
        },
        didDocumentMetadata: {},
        didDocument: null,
      }
    }
    const id = fullId[2]
    const networkId = !fullId[1] ? 'mainnet' : fullId[1].slice(0, -1)
    let blockTag: string | number = options.blockTag || 'latest'
    if (typeof parsed.query === 'string') {
      const qParams = new URLSearchParams(parsed.query)
      blockTag = qParams.get('versionId') ?? blockTag
      const parsedBlockTag = Number.parseInt(blockTag as string)
      if (!Number.isNaN(parsedBlockTag)) {
        blockTag = parsedBlockTag
      } else {
        blockTag = 'latest'
      }
    }

    if (!this.contracts[networkId]) {
      return {
        didResolutionMetadata: {
          error: Errors.unknownNetwork,
          message: `The DID resolver does not have a configuration for network: ${networkId}`,
        },
        didDocumentMetadata: {},
        didDocument: null,
      }
    }

    let now: number = Math.floor(new Date().getTime() / 1000)

    try {
      if (typeof blockTag === 'number') {
        const block = await this.getBlockMetadata(blockTag, networkId)
        now = block.timestamp
      }

      const { address, history, controllerKey, chainId } = await this.changeLog(id, networkId, 'latest')
      const { didDocument, deactivated, versionId, nextVersionId } = this.wrapDidDocument(
        did,
        address,
        controllerKey,
        history,
        chainId,
        blockTag,
        now
      )
      const status = deactivated ? { deactivated: true } : {}
      let versionMeta = {}
      let versionMetaNext = {}
      if (versionId !== 0) {
        const block = await this.getBlockMetadata(versionId, networkId)
        versionMeta = {
          versionId: block.height,
          updated: new Date(block.timestamp * 1000).toISOString().replace('.000', ''),
        }
      }
      if (nextVersionId !== Number.POSITIVE_INFINITY) {
        const block = await this.getBlockMetadata(nextVersionId, networkId)
        versionMetaNext = {
          nextVersionId: block.height,
          nextUpdate: new Date(block.timestamp * 1000).toISOString().replace('.000', ''),
        }
      }

      return {
        didDocumentMetadata: { ...status, ...versionMeta, ...versionMetaNext },
        didResolutionMetadata: { contentType: options.accept ?? 'application/did+ld+json' },
        didDocument: {
          ...didDocument,
          ...(wantLdContext ? { '@context': buildLdContext(didDocument) } : {}),
        },
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      const message: string = e?.message ?? e?.toString() ?? 'unknown error'
      const isHistoricalQuery = typeof blockTag === 'number'
      // Errors that indicate the node lacks historical state (non-archive node)
      const isArchiveError =
        message.includes('missing trie node') ||
        message.includes('header not found') ||
        message.includes('missing revert data') ||
        message.includes('pruned history unavailable') ||
        message.includes('beyond current head block') ||
        message.includes('historical state not available')
      // Pure connectivity/timeout failures — the endpoint is not reachable at all
      const isConnectivityError =
        message.includes('could not detect network') ||
        message.includes('timeout') ||
        e?.code === 'NETWORK_ERROR' ||
        e?.code === 'TIMEOUT'
      // Server responded but with an error — may indicate missing historical data on non-archive nodes
      const isServerError =
        message.includes('missing response') || message.includes('SERVER_ERROR') || e?.code === 'SERVER_ERROR'
      const isRpcError = isConnectivityError || isServerError

      let hint = ''
      if (isArchiveError || (isHistoricalQuery && isServerError)) {
        hint =
          ' The RPC node does not have the requested historical state. Use an archive node to resolve historical DID versions (versionId queries).'
      } else if (isRpcError) {
        hint = ' Ensure the RPC endpoint is reachable.'
      }

      return {
        didResolutionMetadata: {
          error: Errors.notFound,
          message: `${message}${hint}`,
        },
        didDocumentMetadata: {},
        didDocument: null,
      }
    }
  }

  build(): Record<string, DIDResolver> {
    return { ethr: this.resolve.bind(this) }
  }
}

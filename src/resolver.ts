import { BlockTag, encodeBase58, encodeBase64, toUtf8String } from 'ethers'
import { ConfigurationOptions, ConfiguredNetworks, configureResolverWithNetworks } from './configuration.js'
import {
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
  DIDAttributeChanged,
  DIDDelegateChanged,
  DIDOwnerChanged,
  ERC1056Event,
  Errors,
  eventNames,
  identifierMatcher,
  interpretIdentifier,
  legacyAlgoMap,
  legacyAttrTypes,
  LegacyVerificationMethod,
  nullAddress,
  strip0x,
  verificationMethodTypes,
} from './helpers.js'
import { logDecoder } from './logParser.js'

export function getResolver(options: ConfigurationOptions): Record<string, DIDResolver> {
  return new EthrDidResolver(options).build()
}

export class EthrDidResolver {
  private contracts: ConfiguredNetworks

  constructor(options: ConfigurationOptions) {
    this.contracts = configureResolverWithNetworks(options)
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

  async getBlockMetadata(blockHeight: number, networkId: string): Promise<{ height: string; isoDate: string }> {
    const networkContract = this.contracts[networkId]
    if (!networkContract) throw new Error(`No contract configured for network ${networkId}`)
    if (!networkContract.runner) throw new Error(`No runner configured for contract with network ${networkId}`)
    if (!networkContract.runner.provider)
      throw new Error(`No provider configured for runner in contract with network ${networkId}`)
    const block = await networkContract.runner.provider.getBlock(blockHeight)
    if (!block) throw new Error(`Block at height ${blockHeight} not found`)
    return {
      height: block.number.toString(),
      isoDate: new Date(block.timestamp * 1000).toISOString().replace('.000', ''),
    }
  }

  async changeLog(
    identity: string,
    networkId: string,
    blockTag: BlockTag = 'latest'
  ): Promise<{ address: string; history: ERC1056Event[]; controllerKey?: string; chainId: bigint }> {
    const contract = this.contracts[networkId]
    if (!contract) throw new Error(`No contract configured for network ${networkId}`)
    if (!contract.runner) throw new Error(`No runner configured for contract with network ${networkId}`)
    if (!contract.runner.provider)
      throw new Error(`No provider configured for runner in contract with network ${networkId}`)
    const provider = contract.runner.provider
    const hexChainId = networkId.startsWith('0x') ? networkId : undefined
    //TODO: this can be used to check if the configuration is ok
    const chainId = hexChainId ? BigInt(hexChainId) : (await provider.getNetwork()).chainId
    const history: ERC1056Event[] = []
    const { address, publicKey } = interpretIdentifier(identity)
    const controllerKey = publicKey
    let previousChange: bigint | null = await this.previousChange(address, networkId, blockTag)
    while (previousChange) {
      const blockNumber = previousChange
      const logs = await provider.getLogs({
        address: await contract.getAddress(), // networks[networkId].registryAddress,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        topics: [null as any, `0x000000000000000000000000${address.slice(2)}`],
        fromBlock: previousChange,
        toBlock: previousChange,
      })
      const events: ERC1056Event[] = logDecoder(contract, logs)
      events.reverse()
      previousChange = null
      for (const event of events) {
        history.unshift(event)
        if (event.previousChange < blockNumber) {
          previousChange = event.previousChange
        }
      }
    }
    return { address, history, controllerKey, chainId }
  }

  wrapDidDocument(
    did: string,
    address: string,
    controllerKey: string | undefined,
    history: ERC1056Event[],
    chainId: bigint,
    blockHeight: string | number,
    now: bigint
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
    let endpoint = ''
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
      const validTo = event.validTo || BigInt(0)
      const eventIndex = `${event._eventName}-${
        (event as DIDDelegateChanged).delegateType || (event as DIDAttributeChanged).name
      }-${(event as DIDDelegateChanged).delegate || (event as DIDAttributeChanged).value}`
      if (validTo && validTo >= now) {
        if (event._eventName === eventNames.DIDDelegateChanged) {
          const currentEvent = event as DIDDelegateChanged
          delegateCount++
          const delegateType = currentEvent.delegateType //conversion from bytes32 is done in logParser
          switch (delegateType) {
            case 'sigAuth':
              auth[eventIndex] = `${did}#delegate-${delegateCount}`
              signingRefs[eventIndex] = `${did}#delegate-${delegateCount}`
            // eslint-disable-next-line no-fallthrough
            case 'veriKey':
              pks[eventIndex] = {
                id: `${did}#delegate-${delegateCount}`,
                type: verificationMethodTypes.EcdsaSecp256k1RecoveryMethod2020,
                controller: did,
                blockchainAccountId: `eip155:${chainId}:${currentEvent.delegate}`,
              }
              signingRefs[eventIndex] = `${did}#delegate-${delegateCount}`
              break
          }
        } else if (event._eventName === eventNames.DIDAttributeChanged) {
          const currentEvent = event as DIDAttributeChanged
          const name = currentEvent.name //conversion from bytes32 is done in logParser
          const match = name.match(/^did\/(pub|svc)\/(\w+)(\/(\w+))?(\/(\w+))?$/)
          if (match) {
            const section = match[1]
            const algorithm = match[2]
            const type = legacyAttrTypes[match[4]] || match[4]
            const encoding = match[6]
            switch (section) {
              case 'pub': {
                delegateCount++
                const pk: LegacyVerificationMethod = {
                  id: `${did}#delegate-${delegateCount}`,
                  type: `${algorithm}${type}`,
                  controller: did,
                }
                pk.type = legacyAlgoMap[pk.type] || algorithm
                switch (encoding) {
                  case null:
                  case undefined:
                  case 'hex':
                    pk.publicKeyHex = strip0x(currentEvent.value)
                    break
                  case 'base64':
                    pk.publicKeyBase64 = encodeBase64(currentEvent.value)
                    break
                  case 'base58':
                    pk.publicKeyBase58 = encodeBase58(currentEvent.value)
                    break
                  case 'pem':
                    pk.publicKeyPem = toUtf8String(currentEvent.value)
                    break
                  default:
                    pk.value = strip0x(currentEvent.value)
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
                break
              }
              case 'svc': {
                serviceCount++
                const encodedService = toUtf8String(currentEvent.value)
                try {
                  endpoint = JSON.parse(encodedService)
                } catch {
                  endpoint = encodedService
                }
                services[eventIndex] = {
                  id: `${did}#service-${serviceCount}`,
                  type: algorithm,
                  serviceEndpoint: endpoint,
                }
                break
              }
            }
          }
        }
      } else if (event._eventName === eventNames.DIDOwnerChanged) {
        const currentEvent = event as DIDOwnerChanged
        controller = currentEvent.owner
        if (currentEvent.owner === nullAddress) {
          deactivated = true
          break
        }
      } else {
        if (
          event._eventName === eventNames.DIDDelegateChanged ||
          (event._eventName === eventNames.DIDAttributeChanged &&
            (event as DIDAttributeChanged).name.match(/^did\/pub\//))
        ) {
          delegateCount++
        } else if (
          event._eventName === eventNames.DIDAttributeChanged &&
          (event as DIDAttributeChanged).name.match(/^did\/svc\//)
        ) {
          serviceCount++
        }
        delete auth[eventIndex]
        delete signingRefs[eventIndex]
        delete pks[eventIndex]
        delete services[eventIndex]
      }
    }

    const publicKeys: VerificationMethod[] = [
      {
        id: `${did}#controller`,
        type: verificationMethodTypes.EcdsaSecp256k1RecoveryMethod2020,
        controller: did,
        blockchainAccountId: `eip155:${chainId}:${controller}`,
      },
    ]

    if (controllerKey && controller == address) {
      publicKeys.push({
        id: `${did}#controllerKey`,
        type: verificationMethodTypes.EcdsaSecp256k1VerificationKey2019,
        controller: did,
        publicKeyHex: strip0x(controllerKey),
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _unused: Resolvable,
    options: DIDResolutionOptions
  ): Promise<DIDResolutionResult> {
    let ldContext = {}
    if (options.accept === 'application/did+json') {
      ldContext = {}
    } else if (options.accept === 'application/did+ld+json' || typeof options.accept !== 'string') {
      ldContext = {
        '@context': [
          'https://www.w3.org/ns/did/v1',

          // defines EcdsaSecp256k1RecoveryMethod2020 & blockchainAccountId
          'https://w3id.org/security/suites/secp256k1recovery-2020/v2',

          // defines publicKeyHex & EcdsaSecp256k1VerificationKey2019; v2 does not define publicKeyHex
          'https://w3id.org/security/v3-unstable',
        ],
      }
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

    let now = BigInt(Math.floor(new Date().getTime() / 1000))

    if (typeof blockTag === 'number') {
      const block = await this.getBlockMetadata(blockTag, networkId)
      now = BigInt(Date.parse(block.isoDate) / 1000)
    } else {
      // 'latest'
    }

    const { address, history, controllerKey, chainId } = await this.changeLog(id, networkId, 'latest')
    try {
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
          updated: block.isoDate,
        }
      }
      if (nextVersionId !== Number.POSITIVE_INFINITY) {
        const block = await this.getBlockMetadata(nextVersionId, networkId)
        versionMetaNext = {
          nextVersionId: block.height,
          nextUpdate: block.isoDate,
        }
      }

      return {
        didDocumentMetadata: { ...status, ...versionMeta, ...versionMetaNext },
        didResolutionMetadata: { contentType: options.accept ?? 'application/did+ld+json' },
        didDocument: {
          ...didDocument,
          ...ldContext,
        },
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      return {
        didResolutionMetadata: {
          error: Errors.notFound,
          message: e.toString(), // This is not in spec, nut may be helpful
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

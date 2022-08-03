import { Base58 } from '@ethersproject/basex'
import { BigNumber } from '@ethersproject/bignumber'
import { Block, BlockTag } from '@ethersproject/providers'
import { ConfigurationOptions, ConfiguredNetworks, configureResolverWithNetworks } from './configuration'
import { EthrDidController } from './controller'
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
  interpretIdentifier,
  DIDAttributeChanged,
  DIDDelegateChanged,
  ERC1056Event,
  eventNames,
  legacyAlgoMap,
  legacyAttrTypes,
  LegacyVerificationMethod,
  verificationMethodTypes,
  identifierMatcher,
  nullAddress,
  DIDOwnerChanged,
  Errors,
  strip0x,
} from './helpers'
import { logDecoder } from './logParser'

export function getResolver(options: ConfigurationOptions): Record<string, DIDResolver> {
  return new EthrDidResolver(options).build()
}

export class EthrDidResolver {
  private contracts: ConfiguredNetworks

  constructor(options: ConfigurationOptions) {
    this.contracts = configureResolverWithNetworks(options)
  }

  /**
   * returns the current owner of a DID (represented by an address or public key)
   *
   * @param address
   */
  async getOwner(address: string, networkId: string, blockTag?: BlockTag): Promise<string> {
    //TODO: check if address or public key
    return new EthrDidController(address, this.contracts[networkId]).getOwner(address, blockTag)
  }

  /**
   * returns the previous change
   *
   * @param address
   */
  async previousChange(address: string, networkId: string, blockTag?: BlockTag): Promise<BigNumber> {
    const result = await this.contracts[networkId].functions.changed(address, { blockTag })
    // console.log(`last change result: '${BigNumber.from(result['0'])}'`)
    return BigNumber.from(result['0'])
  }

  async getBlockMetadata(blockHeight: number, networkId: string): Promise<{ height: string; isoDate: string }> {
    const block: Block = await this.contracts[networkId].provider.getBlock(blockHeight)
    return {
      height: block.number.toString(),
      isoDate: new Date(block.timestamp * 1000).toISOString().replace('.000', ''),
    }
  }

  async changeLog(
    identity: string,
    networkId: string,
    blockTag: BlockTag = 'latest'
  ): Promise<{ address: string; history: ERC1056Event[]; controllerKey?: string; chainId: number }> {
    const contract = this.contracts[networkId]
    const provider = contract.provider
    const hexChainId = networkId.startsWith('0x') ? networkId : undefined
    //TODO: this can be used to check if the configuration is ok
    const chainId = hexChainId ? BigNumber.from(hexChainId).toNumber() : (await provider.getNetwork()).chainId
    const history: ERC1056Event[] = []
    const { address, publicKey } = interpretIdentifier(identity)
    const controllerKey = publicKey
    let previousChange: BigNumber | null = await this.previousChange(address, networkId, blockTag)
    while (previousChange) {
      const blockNumber = previousChange
      const logs = await provider.getLogs({
        address: contract.address, // networks[networkId].registryAddress,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        topics: [null as any, `0x000000000000000000000000${address.slice(2)}`],
        fromBlock: previousChange.toHexString(),
        toBlock: previousChange.toHexString(),
      })
      const events: ERC1056Event[] = logDecoder(contract, logs)
      events.reverse()
      previousChange = null
      for (const event of events) {
        history.unshift(event)
        if (event.previousChange.lt(blockNumber)) {
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
    chainId: number,
    blockHeight: string | number,
    now: BigNumber
  ): { didDocument: DIDDocument; deactivated: boolean; versionId: number; nextVersionId: number } {
    const baseDIDDocument: DIDDocument = {
      '@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/suites/secp256k1recovery-2020/v2'],
      id: did,
      verificationMethod: [],
      authentication: [],
      assertionMethod: [],
    }

    let controller = address

    const authentication = [`${did}#controller`]
    const keyAgreement: string[] = []

    let versionId = 0
    let nextVersionId = Number.POSITIVE_INFINITY
    let deactivated = false
    let delegateCount = 0
    let serviceCount = 0
    let endpoint = ''
    const auth: Record<string, string> = {}
    const keyAgreementRefs: Record<string, string> = {}
    const pks: Record<string, VerificationMethod> = {}
    const services: Record<string, Service> = {}
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
      const validTo = event.validTo || BigNumber.from(0)
      const eventIndex = `${event._eventName}-${
        (<DIDDelegateChanged>event).delegateType || (<DIDAttributeChanged>event).name
      }-${(<DIDDelegateChanged>event).delegate || (<DIDAttributeChanged>event).value}`
      if (validTo && validTo.gte(now)) {
        if (event._eventName === eventNames.DIDDelegateChanged) {
          const currentEvent = <DIDDelegateChanged>event
          delegateCount++
          const delegateType = currentEvent.delegateType //conversion from bytes32 is done in logParser
          switch (delegateType) {
            case 'sigAuth':
              auth[eventIndex] = `${did}#delegate-${delegateCount}`
            // eslint-disable-line no-fallthrough
            case 'veriKey':
              pks[eventIndex] = {
                id: `${did}#delegate-${delegateCount}`,
                type: verificationMethodTypes.EcdsaSecp256k1RecoveryMethod2020,
                controller: did,
                blockchainAccountId: `eip155:${chainId}:${currentEvent.delegate}`,
              }
              break
          }
        } else if (event._eventName === eventNames.DIDAttributeChanged) {
          const currentEvent = <DIDAttributeChanged>event
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
                    pk.publicKeyBase64 = Buffer.from(currentEvent.value.slice(2), 'hex').toString('base64')
                    break
                  case 'base58':
                    pk.publicKeyBase58 = Base58.encode(Buffer.from(currentEvent.value.slice(2), 'hex'))
                    break
                  case 'pem':
                    pk.publicKeyPem = Buffer.from(currentEvent.value.slice(2), 'hex').toString()
                    break
                  default:
                    pk.value = strip0x(currentEvent.value)
                }
                pks[eventIndex] = pk
                if (match[4] === 'sigAuth') {
                  auth[eventIndex] = pk.id
                } else if (match[4] === 'enc') {
                  keyAgreementRefs[eventIndex] = pk.id
                }
                break
              }
              case 'svc':
                serviceCount++
                try {
                  endpoint = JSON.parse(Buffer.from(currentEvent.value.slice(2), 'hex').toString())
                } catch {
                  endpoint = Buffer.from(currentEvent.value.slice(2), 'hex').toString()
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
      } else if (event._eventName === eventNames.DIDOwnerChanged) {
        const currentEvent = <DIDOwnerChanged>event
        controller = currentEvent.owner
        if (currentEvent.owner === nullAddress) {
          deactivated = true
          break
        }
      } else {
        if (
          event._eventName === eventNames.DIDDelegateChanged ||
          (event._eventName === eventNames.DIDAttributeChanged &&
            (<DIDAttributeChanged>event).name.match(/^did\/pub\//))
        ) {
          delegateCount++
        } else if (
          event._eventName === eventNames.DIDAttributeChanged &&
          (<DIDAttributeChanged>event).name.match(/^did\/svc\//)
        ) {
          serviceCount++
        }
        delete auth[eventIndex]
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
    }

    const didDocument: DIDDocument = {
      ...baseDIDDocument,
      verificationMethod: publicKeys.concat(Object.values(pks)),
      authentication: authentication.concat(Object.values(auth)),
    }
    if (Object.values(services).length > 0) {
      didDocument.service = Object.values(services)
    }
    if (Object.values(keyAgreementRefs).length > 0) {
      didDocument.keyAgreement = keyAgreement.concat(Object.values(keyAgreementRefs))
    }
    didDocument.assertionMethod = [...(didDocument.verificationMethod?.map((pk) => pk.id) || [])]

    return deactivated
      ? {
          didDocument: { ...baseDIDDocument, '@context': 'https://www.w3.org/ns/did/v1' },
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
      try {
        blockTag = Number.parseInt(<string>blockTag)
      } catch (e) {
        blockTag = 'latest'
        // invalid versionId parameters are ignored
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

    let now = BigNumber.from(Math.floor(new Date().getTime() / 1000))

    if (typeof blockTag === 'number') {
      const block = await this.getBlockMetadata(blockTag, networkId)
      now = BigNumber.from(Date.parse(block.isoDate) / 1000)
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
        didResolutionMetadata: { contentType: 'application/did+ld+json' },
        didDocument,
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

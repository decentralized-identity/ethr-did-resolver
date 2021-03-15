import { Base58 } from '@ethersproject/basex'
import { BigNumber } from '@ethersproject/bignumber'
import { BlockTag } from '@ethersproject/providers'
import { ConfigurationOptions, ConfiguredNetworks, configureResolverWithNetworks } from './configuration'
import { EthrDidController } from './controller'
import {
  DIDDocument,
  DIDResolutionOptions,
  DIDResolutionResult,
  DIDResolver,
  ParsedDID,
  Resolver,
  ServiceEndpoint,
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

  async changeLog(
    identity: string,
    networkId: string,
    blockTag: BlockTag = 'latest'
  ): Promise<{ controller: string; history: ERC1056Event[]; controllerKey?: string }> {
    const contract = this.contracts[networkId]
    const provider = contract.provider

    const history: ERC1056Event[] = []
    const { address, publicKey } = interpretIdentifier(identity)
    let controllerKey = publicKey
    let controller = address
    let previousChange: BigNumber | null = await this.previousChange(address, networkId, blockTag)
    // console.log(`gigel 1 - '${previousChange}' - ${typeof previousChange}`)
    if (previousChange) {
      const newController = await this.getOwner(address, networkId, blockTag)
      if (newController.toLowerCase() !== controller.toLowerCase()) {
        controllerKey = undefined
      }
      controller = newController
    }
    while (previousChange) {
      const blockNumber = previousChange
      // console.log(`gigel ${previousChange}`)
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
    return { controller, history, controllerKey }
  }

  wrapDidDocument(
    did: string,
    controller: string,
    controllerKey: string | undefined,
    history: ERC1056Event[]
  ): { didDocument: DIDDocument; deactivated: boolean } {
    const baseDIDDocument: DIDDocument = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3c-ccg.github.io/security-vocab/contexts/security-v3-unstable.jsonld',
      ],
      id: did,
      verificationMethod: [],
      authentication: [],
    }

    // const now = new BN(Math.floor(new Date().getTime() / 1000))
    const now = BigNumber.from(Math.floor(new Date().getTime() / 1000))
    // const expired = {}
    const publicKey: VerificationMethod[] = [
      {
        id: `${did}#controller`,
        type: verificationMethodTypes.EcdsaSecp256k1RecoveryMethod2020,
        controller: did,
        ethereumAddress: controller,
      },
    ]

    const authentication = [`${did}#controller`]

    if (controllerKey) {
      publicKey.push({
        id: `${did}#controllerKey`,
        type: verificationMethodTypes.EcdsaSecp256k1VerificationKey2019,
        controller: did,
        publicKeyHex: controllerKey,
      })
      authentication.push(`${did}#controllerKey`)
    }

    let deactivated = false
    let delegateCount = 0
    let serviceCount = 0
    const auth: Record<string, string> = {}
    const pks: Record<string, VerificationMethod> = {}
    const services: Record<string, ServiceEndpoint> = {}
    for (const event of history) {
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
                ethereumAddress: currentEvent.delegate,
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
                    pk.publicKeyHex = currentEvent.value.slice(2)
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
                    pk.value = currentEvent.value
                }
                pks[eventIndex] = pk
                if (match[4] === 'sigAuth') {
                  auth[eventIndex] = pk.id
                }
                break
              }
              case 'svc':
                serviceCount++
                services[eventIndex] = {
                  id: `${did}#service-${serviceCount}`,
                  type: algorithm,
                  serviceEndpoint: Buffer.from(currentEvent.value.slice(2), 'hex').toString(),
                }
                break
            }
          }
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

        if (event._eventName === eventNames.DIDOwnerChanged) {
          if ((<DIDOwnerChanged>event).owner === nullAddress) {
            deactivated = true
            break
          }
        }
      }
    }

    const doc: DIDDocument = {
      ...baseDIDDocument,
      verificationMethod: publicKey.concat(Object.values(pks)),
      authentication: authentication.concat(Object.values(auth)),
    }
    if (Object.values(services).length > 0) {
      doc.service = Object.values(services)
    }

    return deactivated
      ? { didDocument: { ...baseDIDDocument, '@context': 'https://www.w3.org/ns/did/v1' }, deactivated }
      : { didDocument: doc, deactivated }
  }

  async resolve(
    did: string,
    parsed: ParsedDID,
    _unused: Resolver,
    options: DIDResolutionOptions
  ): Promise<DIDResolutionResult> {
    const fullId = parsed.id.match(identifierMatcher)
    if (!fullId) {
      throw new Error(`Not a valid ethr DID: ${did}`)
    }
    const id = fullId[2]
    const networkId = !fullId[1] ? 'mainnet' : fullId[1].slice(0, -1)

    if (!this.contracts[networkId])
      throw new Error(`unknown_network: The DID resolver does not have a configuration for network: ${networkId}`)

    const { controller, history, controllerKey } = await this.changeLog(id, networkId, options.blockTag)
    try {
      const { didDocument, deactivated } = this.wrapDidDocument(did, controller, controllerKey, history)
      const status = deactivated ? { deactivated: true } : {}
      return {
        didDocumentMetadata: { ...status },
        didResolutionMetadata: { contentType: 'application/did+ld+json' },
        didDocument,
      }
    } catch (e) {
      return {
        didResolutionMetadata: {
          error: 'notFound',
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

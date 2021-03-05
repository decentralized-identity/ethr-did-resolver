import DidRegistryContract from 'ethr-did-registry'
import {
  Web3Provider,
  JsonRpcProvider,
  Provider,
  EtherscanProvider,
  BlockTag,
  AlchemyProvider,
  Filter,
  Log
} from '@ethersproject/providers'
import { Contract, ContractFactory, Event } from '@ethersproject/contracts'
import { getAddress, isAddress, getIcapAddress, getContractAddress } from '@ethersproject/address'
import { computeAddress } from '@ethersproject/transactions'
import { BigNumber, BigNumberish } from '@ethersproject/bignumber'
import abi from 'ethjs-abi'
import {  logDecoder, } from './logParser'
import {
  DIDDocument,
  DIDResolutionOptions,
  DIDResolutionResult,
  DIDResolver,
  ParsedDID,
  Resolver,
  ServiceEndpoint,
  VerificationMethod
} from 'did-resolver'
import { ConfigurationOptions, ConfiguredNetworks, configureResolverWithNetworks } from './configuration'
import { bytes32toString, DIDAttributeChanged, DIDDelegateChanged, ERC1056Event } from './utils'

interface LegacyVerificationMethod extends VerificationMethod {
  /**@deprecated */
  publicKeyHex?: string
  /**@deprecated */
  publicKeyBase64?: string
  /**@deprecated */
  publicKeyPem?: string
  [x: string]: any
}

const legacyAttrTypes: Record<string, string> = {
  sigAuth: 'SignatureAuthentication2018',
  veriKey: 'VerificationKey2018',
  enc: 'KeyAgreementKey2019'
}

const identifierMatcher = /^(.*)?(0x[0-9a-fA-F]{40}|0x[0-9a-fA-F]{66})$/

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
    // const contract = new Contract(this.registryAddress, DidRegistryContract as any, this.provider)
    //TODO: check if address or public key
    const controllerRecord = await this.contracts[networkId].functions.identityOwner(address, { blockTag })
    // console.log(`controller for address ${address} is '${controllerRecord[0]}'`)
    return controllerRecord[0]
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

  interpretIdentifier(identifier: string): { address: string; publicKey?: string } {
    if (identifier.length > 42) {
      return { address: computeAddress(identifier), publicKey: identifier }
    } else {
      return { address: getAddress(identifier) } // checksum address
    }
  }

  async changeLog(identity: string, networkId: string, blockTag: BlockTag = 'latest') {
    const contract = this.contracts[networkId]
    const provider = contract.provider

    const history = []
    let { address, publicKey } = this.interpretIdentifier(identity)
    let controller = address
    let previousChange: BigNumber | null = await this.previousChange(address, networkId, blockTag)
    // console.log(`gigel 1 - '${previousChange}' - ${typeof previousChange}`)
    if (previousChange) {
      const newController = await this.getOwner(address, networkId, blockTag)
      if (newController.toLowerCase() !== controller.toLowerCase()) {
        publicKey = undefined
      }
      controller = newController
    }
    while (previousChange) {
      const blockNumber = previousChange
      // console.log(`gigel ${previousChange}`)
      const logs = await provider.getLogs({
        address: contract.address, // networks[networkId].registryAddress,
        topics: [null as any, `0x000000000000000000000000${address.slice(2)}`],
        fromBlock: previousChange.toHexString(),
        toBlock: previousChange.toHexString()
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
    return { controller, history, publicKey }
  }

  wrapDidDocument(did: string, controller: string, controllerKey: string | undefined, history: ERC1056Event[]) {
    // const now = new BN(Math.floor(new Date().getTime() / 1000))
    const now = BigNumber.from(Math.floor(new Date().getTime() / 1000))
    // const expired = {}
    const publicKey: VerificationMethod[] = [
      {
        id: `${did}#controller`,
        type: 'EcdsaSecp256k1RecoveryMethod2020',
        controller: did,
        ethereumAddress: controller
      }
    ]

    const authentication = [`${did}#controller`]

    if (controllerKey) {
      publicKey.push({
        id: `${did}#controllerKey`,
        type: 'EcdsaSecp256k1VerificationKey2019',
        controller: did,
        publicKeyHex: controllerKey
      })
      authentication.push(`${did}#controllerKey`)
    }

    let delegateCount = 0
    let serviceCount = 0
    const auth: Record<string, string> = {}
    const pks: Record<string, VerificationMethod> = {}
    const services: Record<string, ServiceEndpoint> = {}
    for (const event of history) {
      const validTo = event.validTo || BigNumber.from(0)
      let eventIndex = `${event._eventName}-${
        (<DIDDelegateChanged>event).delegateType || (<DIDAttributeChanged>event).name
      }-${(<DIDDelegateChanged>event).delegate || (<DIDAttributeChanged>event).value}`
      if (validTo && validTo.gte(now)) {
        if (event._eventName === 'DIDDelegateChanged') {
          const currentEvent = <DIDDelegateChanged>event
          delegateCount++
          const delegateType = bytes32toString(currentEvent.delegateType)
          switch (delegateType) {
            case 'sigAuth':
              auth[eventIndex] = `${did}#delegate-${delegateCount}`
            // eslint-disable-line no-fallthrough
            case 'veriKey':
              pks[eventIndex] = {
                id: `${did}#delegate-${delegateCount}`,
                type: 'Secp256k1VerificationKey2018',
                controller: did,
                ethereumAddress: currentEvent.delegate
              }
              break
          }
        } else if (event._eventName === 'DIDAttributeChanged') {
          const currentEvent = <DIDAttributeChanged>event
          const name = bytes32toString(currentEvent.name)
          const match = name.match(/^did\/(pub|auth|svc)\/(\w+)(\/(\w+))?(\/(\w+))?$/)
          // const match = name.match(/^did\/([vaukdis]*)\/(\w+)(\/(\w+))?(\/(\w+))?$/)
          if (match) {
            const section = match[1]
            const algo = match[2]
            const type = legacyAttrTypes[match[4]] || match[4]
            const encoding = match[6]
            switch (section) {
              case 'pub': {
                delegateCount++
                const pk: LegacyVerificationMethod = {
                  id: `${did}#delegate-${delegateCount}`,
                  type: `${algo}${type}`,
                  controller: did
                }
                switch (encoding) {
                  case null:
                  case undefined:
                  case 'hex':
                    pk.publicKeyHex = currentEvent.value.slice(2)
                    break
                  case 'base64':
                    pk.publicKeyBase64 = Buffer.from(currentEvent.value.slice(2), 'hex').toString('base64')
                    break
                  // case 'base58':
                  //   pk.publicKeyBase58 = Buffer.from(currentEvent.value.slice(2), 'hex').toString('base58')
                  //   break
                  case 'pem':
                    pk.publicKeyPem = Buffer.from(currentEvent.value.slice(2), 'hex').toString()
                    break
                  default:
                    pk.value = currentEvent.value
                }
                pks[eventIndex] = pk
                break
              }
              case 'svc':
                serviceCount++
                services[eventIndex] = {
                  id: `${did}#service-${serviceCount}`,
                  type: algo,
                  serviceEndpoint: Buffer.from(currentEvent.value.slice(2), 'hex').toString()
                }
                break
            }
          }
        }
      } else {
        if (
          delegateCount > 0 &&
          (event._eventName === 'DIDDelegateChanged' ||
            (event._eventName === 'DIDAttributeChanged' &&
              bytes32toString((<DIDAttributeChanged>event).name).match(/^did\/pub\//))) &&
          validTo.lt(now)
        ) {
          delegateCount--
        }
        delete auth[eventIndex]
        delete pks[eventIndex]
        delete services[eventIndex]
      }
    }

    const doc: DIDDocument = {
      '@context': 'https://w3id.org/did/v1',
      id: did,
      publicKey: publicKey.concat(Object.values(pks)),
      authentication: authentication.concat(Object.values(auth))
    }
    if (Object.values(services).length > 0) {
      doc.service = Object.values(services)
    }

    return doc
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

    if (!this.contracts[networkId]) throw new Error(`unknown_network: The DID resolver does not have a configuration for network: ${networkId}`)

    const { controller, history, publicKey } = await this.changeLog(id, networkId, options.blockTag)
    try {
      const doc = this.wrapDidDocument(did, controller, publicKey, history)
      return {
        didDocumentMetadata: {},
        didResolutionMetadata: { contentType: 'application/did+ld+json' },
        didDocument: doc
      }
    } catch (e) {
      return {
        didResolutionMetadata: {
          error: 'notFound',
          message: e.toString() // This is not in spec, nut may be helpful
        },
        didDocumentMetadata: {},
        didDocument: null
      }
    }
  }

  build(): Record<string, DIDResolver> {
    return { ethr: this.resolve.bind(this) }
  }
}

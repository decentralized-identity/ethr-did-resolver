import { VerificationMethod } from 'did-resolver'
import { computeAddress, getAddress, toUtf8Bytes, toUtf8String, zeroPadBytes } from 'ethers'

export const identifierMatcher = /^(.*)?(0x[0-9a-fA-F]{40}|0x[0-9a-fA-F]{66})$/
export const nullAddress = '0x0000000000000000000000000000000000000000'
export const DEFAULT_REGISTRY_ADDRESS = '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b'
export const DEFAULT_JSON_RPC = 'http://127.0.0.1:8545/'
export const MESSAGE_PREFIX = '0x1900'

export type address = string
export type uint256 = bigint
export type bytes32 = string
export type bytes = string

export interface ERC1056Event {
  identity: address
  previousChange: uint256
  validTo?: bigint
  _eventName: string
  blockNumber: number
}

export interface DIDOwnerChanged extends ERC1056Event {
  owner: address
}

export interface DIDAttributeChanged extends ERC1056Event {
  name: bytes32
  value: bytes
  validTo: uint256
}

export interface DIDDelegateChanged extends ERC1056Event {
  delegateType: bytes32
  delegate: address
  validTo: uint256
}

export enum verificationMethodTypes {
  EcdsaSecp256k1VerificationKey2019 = 'EcdsaSecp256k1VerificationKey2019',
  EcdsaSecp256k1RecoveryMethod2020 = 'EcdsaSecp256k1RecoveryMethod2020',
  Ed25519VerificationKey2018 = 'Ed25519VerificationKey2018',
  RSAVerificationKey2018 = 'RSAVerificationKey2018',
  X25519KeyAgreementKey2019 = 'X25519KeyAgreementKey2019',
}

export enum eventNames {
  DIDOwnerChanged = 'DIDOwnerChanged',
  DIDAttributeChanged = 'DIDAttributeChanged',
  DIDDelegateChanged = 'DIDDelegateChanged',
}

export interface LegacyVerificationMethod extends VerificationMethod {
  /**@deprecated */
  publicKeyHex?: string
  /**@deprecated */
  publicKeyBase64?: string
  /**@deprecated */
  publicKeyPem?: string

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [x: string]: any
}

/**
 * Interface for transporting v, r, s signature parameters used in meta transactions
 */
export interface MetaSignature {
  sigV: number
  sigR: bytes32
  sigS: bytes32
}

export const legacyAttrTypes: Record<string, string> = {
  sigAuth: 'SignatureAuthentication2018',
  veriKey: 'VerificationKey2018',
  enc: 'KeyAgreementKey2019',
}

export const legacyAlgoMap: Record<string, string> = {
  /**@deprecated */
  Secp256k1VerificationKey2018: verificationMethodTypes.EcdsaSecp256k1VerificationKey2019,
  /**@deprecated */
  Ed25519SignatureAuthentication2018: verificationMethodTypes.Ed25519VerificationKey2018,
  /**@deprecated */
  Secp256k1SignatureAuthentication2018: verificationMethodTypes.EcdsaSecp256k1VerificationKey2019,
  //keep legacy mapping
  RSAVerificationKey2018: verificationMethodTypes.RSAVerificationKey2018,
  Ed25519VerificationKey2018: verificationMethodTypes.Ed25519VerificationKey2018,
  X25519KeyAgreementKey2019: verificationMethodTypes.X25519KeyAgreementKey2019,
}

export function strip0x(input: string): string {
  return input.startsWith('0x') ? input.slice(2) : input
}

export function bytes32toString(input: bytes32 | Uint8Array): string {
  return toUtf8String(input).replace(/\0+$/, '')
}

export function stringToBytes32(str: string): string {
  const bytes = toUtf8Bytes(str)
  return zeroPadBytes(bytes.slice(0, 32), 32)
}

export function interpretIdentifier(identifier: string): { address: string; publicKey?: string; network?: string } {
  let id = identifier
  let network = undefined
  if (id.startsWith('did:ethr')) {
    id = id.split('?')[0]
    const components = id.split(':')
    id = components[components.length - 1]
    if (components.length >= 4) {
      network = components.splice(2, components.length - 3).join(':')
    }
  }
  if (id.length > 42) {
    return { address: computeAddress(id), publicKey: id, network }
  } else {
    return { address: getAddress(id), network } // checksum address
  }
}

export enum Errors {
  /**
   * The resolver has failed to construct the DID document.
   * This can be caused by a network issue, a wrong registry address or malformed logs while parsing the registry
   * history. Please inspect the `DIDResolutionMetadata.message` to debug further.
   */
  notFound = 'notFound',

  /**
   * The resolver does not know how to resolve the given DID. Most likely it is not a `did:ethr`.
   */
  invalidDid = 'invalidDid',

  /**
   * The resolver is misconfigured or is being asked to resolve a `DID` anchored on an unknown network
   */
  unknownNetwork = 'unknownNetwork',

  /**
   * The resolver does not support the 'accept' format requested with `DIDResolutionOptions`
   */
  unsupportedFormat = 'unsupportedFormat',
}

/**
 * Returns true when the argument is defined and not null.
 * Usable as array.filter(isDefined)
 * @param arg
 */
export function isDefined<T>(arg: T): arg is Exclude<T, null | undefined> {
  return arg !== null && typeof arg !== 'undefined'
}

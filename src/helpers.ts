import { Extensible, JsonWebKey, VerificationMethod } from 'did-resolver'
import {
  computeAddress,
  encodeBase58,
  encodeBase64,
  getBytes,
  getAddress,
  SigningKey,
  toUtf8Bytes,
  toUtf8String,
  zeroPadBytes,
} from 'ethers'

export const identifierMatcher = /^(.*)?(0x[0-9a-fA-F]{40}|0x[0-9a-fA-F]{66})$/
export const nullAddress = '0x0000000000000000000000000000000000000000'
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

export const VMTypes = {
  EcdsaSecp256k1VerificationKey2019: 'EcdsaSecp256k1VerificationKey2019',
  EcdsaSecp256k1RecoveryMethod2020: 'EcdsaSecp256k1RecoveryMethod2020',
  Ed25519VerificationKey2020: 'Ed25519VerificationKey2020',
  X25519KeyAgreementKey2020: 'X25519KeyAgreementKey2020',
  Multikey: 'Multikey',
} as const
export type VMTypes = (typeof VMTypes)[keyof typeof VMTypes]

export const eventNames = {
  DIDOwnerChanged: 'DIDOwnerChanged',
  DIDAttributeChanged: 'DIDAttributeChanged',
  DIDDelegateChanged: 'DIDDelegateChanged',
} as const
export type eventNames = (typeof eventNames)[keyof typeof eventNames]

/**
 * Verification Method definitions that allow extra properties
 */
export type ExtendedVerificationMethod = VerificationMethod & Extensible

/**
 * Interface for transporting v, r, s signature parameters used in meta transactions
 */
export interface MetaSignature {
  sigV: number
  sigR: bytes32
  sigS: bytes32
}

/**
 * Maps the `<key algorithm>` token from a `did/pub/<algorithm>/...` attribute name
 * to the canonical verification method type for that algorithm.
 *
 * This is the primary lookup. If the algorithm is not found here the verbatim
 * string `<algorithm>` is used.
 */
export const algoToVMType: Record<string, string> = {
  Secp256k1: VMTypes.EcdsaSecp256k1VerificationKey2019,
  Ed25519: VMTypes.Ed25519VerificationKey2020,
  X25519: VMTypes.X25519KeyAgreementKey2020,
  Multikey: VMTypes.Multikey,
}

export function strip0x(input: string): string {
  return input.startsWith('0x') ? input.slice(2) : input
}

export function bytes32toString(input: bytes32 | Uint8Array): string | null {
  try {
    return toUtf8String(input).replace(/\0+$/, '')
  } catch {
    return null
  }
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

export const Errors = {
  /**
   * The resolver has failed to construct the DID document.
   * This can be caused by a network issue, a wrong registry address or malformed logs while parsing the registry
   * history. Please inspect the `DIDResolutionMetadata.message` to debug further.
   */
  notFound: 'notFound',

  /**
   * The resolver does not know how to resolve the given DID. Most likely it is not a `did:ethr`.
   */
  invalidDid: 'invalidDid',

  /**
   * The resolver is misconfigured or is being asked to resolve a `DID` anchored on an unknown network
   */
  unknownNetwork: 'unknownNetwork',

  /**
   * The resolver does not support the 'accept' format requested with `DIDResolutionOptions`
   */
  unsupportedFormat: 'unsupportedFormat',
} as const
export type Errors = (typeof Errors)[keyof typeof Errors]

/**
 * Returns true when the argument is defined and not null.
 * Usable as array.filter(isDefined)
 * @param arg
 */
export function isDefined<T>(arg: T): arg is Exclude<T, null | undefined> {
  return arg !== null && typeof arg !== 'undefined'
}

/**
 * Multicodec varint prefixes for known key types.
 * Used to construct publicKeyMultibase values per the Multikey spec.
 */
export const multicodecPrefixes: Partial<Record<VMTypes, Uint8Array>> = {
  [VMTypes.Ed25519VerificationKey2020]: new Uint8Array([0xed, 0x01]), // ed25519-pub
  [VMTypes.X25519KeyAgreementKey2020]: new Uint8Array([0xec, 0x01]), // x25519-pub
  [VMTypes.EcdsaSecp256k1VerificationKey2019]: new Uint8Array([0xe7, 0x01]), // secp256k1-pub
  // Multikey: prefix is already embedded in the on-chain value (e.g. 0x1200 for P-256)
}

/**
 * Encodes raw key bytes (hex string with or without 0x prefix) as a multibase base58btc string.
 * If a multicodec prefix is provided it is prepended before encoding.
 * If no prefix is provided the bytes are encoded as-is (for Multikey, where the prefix is
 * already present in the on-chain value).
 */
export function toMultibase(hexValue: string, prefix?: Uint8Array): string {
  const raw = getBytes(`0x${strip0x(hexValue)}`)
  const full = prefix ? new Uint8Array([...prefix, ...raw]) : raw
  return 'z' + encodeBase58(full)
}

/**
 * Decompresses a 33-byte secp256k1 public key (hex, with or without 0x prefix) and
 * returns a JWK object suitable for use as `publicKeyJwk` in a DID document.
 */
export function compressedSecp256k1ToJwk(hex: string): JsonWebKey {
  const uncompressed = SigningKey.computePublicKey(hex.startsWith('0x') ? hex : `0x${hex}`, false)
  // uncompressed is 0x04 || x (32 bytes) || y (32 bytes)
  const raw = getBytes(uncompressed)
  const toBase64url = (bytes: Uint8Array) =>
    encodeBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const x = toBase64url(raw.slice(1, 33))
  const y = toBase64url(raw.slice(33, 65))
  return { kty: 'EC', crv: 'secp256k1', x, y }
}

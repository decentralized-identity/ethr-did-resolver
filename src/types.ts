import { BigNumber } from '@ethersproject/bignumber'
import { VerificationMethod } from 'did-resolver'

export type address = string
export type uint256 = BigNumber
export type bytes32 = string
export type bytes = string

export interface ERC1056Event {
  identity: address
  previousChange: uint256
  validTo?: uint256
  _eventName: string
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

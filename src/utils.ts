import { BigNumber } from "@ethersproject/bignumber"

type address = string
type uint256 = BigNumber
type bytes32 = string
type bytes = string

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

export function bytes32toString(input: bytes32 | Uint8Array) {
  let buff: Buffer = typeof input === 'string' ? Buffer.from(input.slice(2), 'hex') : Buffer.from(input)
  return buff.toString('utf8').replace(/\0+$/, '')
}

export function stringToBytes32(str: string) {
  const buffStr = '0x' + Buffer.from(str).slice(0, 32).toString('hex')
  return buffStr + '0'.repeat(66 - buffStr.length)
}
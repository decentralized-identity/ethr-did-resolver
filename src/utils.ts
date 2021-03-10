import { computeAddress } from '@ethersproject/transactions'
import { getAddress } from '@ethersproject/address'
import { bytes32 } from './types'

export function bytes32toString(input: bytes32 | Uint8Array): string {
  const buff: Buffer = typeof input === 'string' ? Buffer.from(input.slice(2), 'hex') : Buffer.from(input)
  return buff.toString('utf8').replace(/\0+$/, '')
}

export function stringToBytes32(str: string): string {
  const buffStr = '0x' + Buffer.from(str).slice(0, 32).toString('hex')
  return buffStr + '0'.repeat(66 - buffStr.length)
}

export function interpretIdentifier(identifier: string): { address: string; publicKey?: string } {
  if (identifier.length > 42) {
    return { address: computeAddress(identifier), publicKey: identifier }
  } else {
    return { address: getAddress(identifier) } // checksum address
  }
}

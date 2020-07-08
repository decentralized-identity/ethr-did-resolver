import { ec as EC } from 'elliptic'
import { keccak_256 as sha3 } from 'js-sha3'

import { Buffer } from 'buffer'

function keccak(data) {
  return Buffer.from(sha3.arrayBuffer(data))
}

const secp256k1 = new EC('secp256k1')

export function toEthereumAddress(hexPublicKey) {
  const noPrefix = ('' + hexPublicKey).startsWith('0x') ? hexPublicKey.slice(2) : hexPublicKey
  const uncompressed = secp256k1.keyFromPublic(noPrefix, 'hex').getPublic().encode('hex')
  const address = `0x${keccak(Buffer.from(uncompressed.slice(2), 'hex'))
    .slice(-20)
    .toString('hex')}`
  return getChecksumAddress(address)
}

export function getChecksumAddress(addressInput) {
  var address = addressInput

  address = address.substring(2).toLowerCase()
  const hashed = keccak(address)

  address = address.split('')
  for (var i = 0; i < 40; i += 2) {
    if (hashed[i / 2] >> 4 >= 8) {
      address[i] = address[i].toUpperCase()
    }
    if ((hashed[i / 2] & 0x0f) >= 8) {
      address[i + 1] = address[i + 1].toUpperCase()
    }
  }

  return `0x${address.join('')}`
}

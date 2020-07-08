import { ec as EC } from 'elliptic'
import { toEthereumAddress } from '../utils'
const secp256k1 = new EC('secp256k1')

describe('publicKey gets transformed properly', () => {
  it('generates correct address', () => {
    const publicKey = secp256k1
      .keyFromPrivate('278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f', 'hex')
      .getPublic()
    const expectedAddress = '0xF3beAC30C498D9E26865F34fCAa57dBB935b0D74'

    const uncompressed = publicKey.encode('hex')
    const compressed = publicKey.encode('hex', true)

    expect(toEthereumAddress(compressed)).toBe(expectedAddress)
    expect(toEthereumAddress(compressed.toUpperCase())).toBe(expectedAddress)
    expect(toEthereumAddress(uncompressed)).toBe(expectedAddress)
    expect(toEthereumAddress('0x' + compressed)).toBe(expectedAddress)
    expect(toEthereumAddress('0x' + uncompressed)).toBe(expectedAddress)
  })
})

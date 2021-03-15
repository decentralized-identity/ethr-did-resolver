import { identifierMatcher } from '../helpers'

describe('pattern matcher', () => {
  const matcher = identifierMatcher

  describe('matches', () => {
    it('blockchainAccountId:', () => {
      expect(matcher.test('0xd0dbe9d3698738f899ccd8ee27ff2347a7faa4dd')).toBe(true)
    })

    it('blockchainAccountId: ignoring case', () => {
      expect(matcher.test('0x' + 'd0dbe9d3698738f899ccd8ee27ff2347a7faa4dd'.toUpperCase())).toBe(true)
    })

    it('publicKeyHex compressed', () => {
      expect(matcher.test('0x02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71')).toBe(true)
    })

    it('publicKeyHex compressed ignore case', () => {
      expect(
        matcher.test('0x' + '02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71'.toUpperCase())
      ).toBe(true)
    })
  })

  describe('rejects', () => {
    it('hex strings of smaller size', () => {
      expect(matcher.test('0xd0dbe9d3698738f899ccd8ee27ff23')).toBe(false)
    })

    it('hex strings of ambiguous size', () => {
      expect(matcher.test('0x02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f14')).toBe(false)
    })

    it('hex strings of larger size', () => {
      expect(matcher.test('0x02b97c30de767f084ce3080168ee293053ba33b235d7116a3263d29f1450936b71dbe9d369')).toBe(false)
    })
  })
})

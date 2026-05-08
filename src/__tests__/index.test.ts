import { test, expect } from 'vitest'
import * as index from '../index'

test('has export definitions', () => {
  expect.assertions(5)
  expect(index.bytes32toString).toBeDefined()
  expect(index.getResolver).toBeDefined()
  expect(index.identifierMatcher).toBeDefined()
  expect(index.stringToBytes32).toBeDefined()
  expect(index.verificationMethodTypes).toBeDefined()
})

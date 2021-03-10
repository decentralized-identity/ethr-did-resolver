import { DEFAULT_REGISTRY_ADDRESS } from './configuration'
import { getResolver, identifierMatcher } from './resolver'
import { legacyAlgoMap, legacyAttrTypes, verificationMethodTypes } from './types'
import { bytes32toString, stringToBytes32 } from './utils'

export {
  DEFAULT_REGISTRY_ADDRESS as REGISTRY,
  getResolver,
  bytes32toString,
  stringToBytes32,
  /**@deprecated */
  legacyAlgoMap as delegateTypes,
  /**@deprecated */
  legacyAttrTypes as attrTypes,
  verificationMethodTypes,
  identifierMatcher,
}

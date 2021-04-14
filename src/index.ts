import { getResolver } from './resolver'
import { EthrDidController } from './controller'
import {
  bytes32toString,
  DEFAULT_REGISTRY_ADDRESS,
  identifierMatcher,
  legacyAlgoMap,
  legacyAttrTypes,
  stringToBytes32,
  verificationMethodTypes,
  Errors,
} from './helpers'

export {
  DEFAULT_REGISTRY_ADDRESS as REGISTRY,
  getResolver,
  bytes32toString,
  stringToBytes32,
  EthrDidController,
  /**@deprecated */
  legacyAlgoMap as delegateTypes,
  /**@deprecated */
  legacyAttrTypes as attrTypes,
  verificationMethodTypes,
  identifierMatcher,
  Errors,
}

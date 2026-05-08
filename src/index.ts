import { getResolver } from './resolver.js'
import { EthrDidController } from './controller.js'
import {
  bytes32toString,
  Errors,
  identifierMatcher,
  interpretIdentifier,
  stringToBytes32,
  VMTypes,
  MetaSignature,
} from './helpers.js'

import { EthereumDIDRegistry } from './config/EthereumDIDRegistry.js'
import { deployments, EthrDidRegistryDeployment } from './config/deployments.js'

export {
  getResolver,
  bytes32toString,
  stringToBytes32,
  EthrDidController,
  VMTypes as verificationMethodTypes,
  identifierMatcher,
  interpretIdentifier,
  Errors,
  EthereumDIDRegistry,
  MetaSignature,
  deployments,
  EthrDidRegistryDeployment,
}

// workaround for esbuild/vite/hermes issues
// This should not be needed once we move to ESM only build outputs.
// This library now builds as a CommonJS library, with a small ESM wrapper on top.
// This pattern seems to confuse some bundlers, causing errors like `Cannot read 'getResolver' of undefined`
// see https://github.com/decentralized-identity/ethr-did-resolver/issues/186
export default {
  getResolver,
  bytes32toString,
  stringToBytes32,
  EthrDidController,
  verificationMethodTypes: VMTypes,
  identifierMatcher,
  interpretIdentifier,
  Errors,
  EthereumDIDRegistry,
  deployments,
}

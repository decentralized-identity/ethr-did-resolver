import cjsModule from '../lib/index.js'

const getResolver = cjsModule.getResolver
const deployments = cjsModule.deployments
const REGISTRY = cjsModule.REGISTRY
const bytes32toString = cjsModule.bytes32toString
const stringToBytes32 = cjsModule.stringToBytes32
const EthrDidController = cjsModule.EthrDidController
const verificationMethodTypes = cjsModule.verificationMethodTypes
const identifierMatcher = cjsModule.identifierMatcher
const interpretIdentifier = cjsModule.interpretIdentifier
const Errors = cjsModule.Errors
const EthereumDIDRegistry = cjsModule.EthereumDIDRegistry

export {
  getResolver,
  deployments,
  REGISTRY,
  bytes32toString,
  stringToBytes32,
  EthrDidController,
  verificationMethodTypes,
  identifierMatcher,
  interpretIdentifier,
  Errors,
  EthereumDIDRegistry,
  cjsModule as default
}

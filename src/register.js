import { registerMethod } from 'did-resolver'
import Contract from 'truffle-contract'
import DidRegistryContract from 'ethr-did-registry'
import Web3 from 'web3'

export const REGISTRY = '0xc1b66dea11f8f321b7981e1666fdaf3637fe0f61'

export function wrapDidDocument (did, address) {
  return {
    '@context': 'https://w3id.org/did/v1',
    id: did,
    publicKey: [{
      id: `${did}#keys-1`,
      type: 'Secp256k1VerificationKey2018',
      owner: did,
      ethereumAddress: address
    }]
  }
}

function configureProvider (conf = {}) {
  if (conf.provider) {
    return conf.provider
  } else if (conf.web3) {
    return conf.web3.currentProvider
  } else {
    return new Web3.providers.HttpProvider(conf.rpcUrl || 'https://mainnet.infura.io/ethr-did')
  }
}

export function configureRegistry (conf = {}) {
  const registryAddress = conf.registry || REGISTRY
  const DidReg = Contract(DidRegistryContract)
  DidReg.setProvider(configureProvider(conf))
  return DidReg.at(registryAddress)
}

function register (conf = {}) {
  const didReg = configureRegistry(conf)
  async function resolve (did, parsed) {
    if (!parsed.id.match(/^0x[0-9a-fA-F]{40}$/)) throw new Error(`Not a valid ethr DID: ${did}`)
    const owner = await didReg.identityOwner(parsed.id)
    return wrapDidDocument(did, owner)
  }
  registerMethod('ethr', resolve)
}

module.exports = register

import { registerMethod } from 'did-resolver'
import Contract from 'truffle-contract'
import DidRegistryContract from 'ethr-did-registry'
import Web3 from 'web3'

export const REGISTRY = '0xc1b66dea11f8f321b7981e1666fdaf3637fe0f61'

export function wrapDidDocument (did, owner, history) {
  const now = Math.floor(new Date().getTime() / 1000)
  // const expired = {}
  // console.log(history)
  const publicKey = [{
    id: `${did}#owner`,
    type: 'Secp256k1VerificationKey2018',
    owner: did,
    ethereumAddress: owner
  }]

  const authentication = [{
    type: 'Secp256k1SignatureAuthentication2018',
    publicKey: `${did}#owner`
  }]

  let delegateCount = 0
  const auth = {}
  const pks = {}
  for (let {event, args} of history) {
    // console.log(`validTo: ${args.validTo.toNumber()} and now: ${now}`)
    const key = `${event}-${args.delegateType||args.name}-${args.delegate||args.value}`
    if (event === 'DIDDelegateChanged') {
      if (args.validTo.toNumber() >= now) {
        delegateCount++
        switch (args.delegateType) {
          case 'Secp256k1SignatureAuthentication2018':
            auth[key] = {
              type: 'Secp256k1SignatureAuthentication2018',
              publicKey: `${did}#delegate-${delegateCount}`
            }
          case 'Secp256k1VerificationKey2018':
            pks[key] = {
              id: `${did}#delegate-${delegateCount}`,
              type: 'Secp256k1VerificationKey2018',
              owner: did,
              ethereumAddress: args.delegate
            }
            break
        }
      } else {
        if (args.validTo.toNumber() === 0) delegateCount--
        delete auth[key]
        delete pks[key]
      }
    }      
  }

  return {
    '@context': 'https://w3id.org/did/v1',
    id: did,
    publicKey: publicKey.concat(Object.values(pks)),
    authentication: authentication.concat(Object.values(auth))
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

function getLogs (filter) {
  return new Promise((resolve, reject) => {
    filter.get((error, events) => {
      if (error) return reject(error)
      resolve(events)
    })
  })
}

function register (conf = {}) {
  const didReg = configureRegistry(conf)

  async function changeLog (identity) {
    const history = []
    let previousChange = await didReg.changed(identity)
    while (previousChange) {
      const filter = await didReg.allEvents({topics: [identity], fromBlock: previousChange, toBlock: previousChange})
      const events = await getLogs(filter)
      previousChange = undefined
      for (let event of events) {
        history.unshift(event)
        previousChange = event.args.previousChange
      }
    }
    return history
  }
  async function resolve (did, parsed) {
    if (!parsed.id.match(/^0x[0-9a-fA-F]{40}$/)) throw new Error(`Not a valid ethr DID: ${did}`)
    const owner = await didReg.identityOwner(parsed.id)
    const history = await changeLog(parsed.id)
    return wrapDidDocument(did, owner, history)
  }
  registerMethod('ethr', resolve)
}

module.exports = register

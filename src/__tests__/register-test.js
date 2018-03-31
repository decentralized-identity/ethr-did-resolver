import resolve from 'did-resolver'
import register from '../register'

import Contract from 'truffle-contract'
import DidRegistryContract from 'ethr-did-registry'
import Web3 from 'web3'
import ganache from 'ganache-cli'

describe('ethrResolver', () => {
  const provider = ganache.provider()
  // const provider = new Web3.providers.HttpProvider('http://127.0.0.1:7545')
  const DidReg = Contract(DidRegistryContract)
  const web3 = new Web3()
  web3.setProvider(provider)
  const getAccounts = () => new Promise((resolve, reject) => web3.eth.getAccounts((error, accounts) => error ? reject(error) : resolve(accounts)))
  DidReg.setProvider(provider)

  let registry
  let accounts
  let identity

  beforeAll(async () => {
    accounts = await getAccounts()
    identity = accounts[1]
    registry = await DidReg.new({
      from: accounts[0],
      gasPrice: 100000000000,
      gas: 4712388 //1779962
    })
    register({provider, registry: registry.address})
  })

  describe('unregistered', () => {
    it('resolves document', () => {
      const did = `did:ethr:${identity}`
      expect(resolve(did)).resolves.toEqual({
        '@context': 'https://w3id.org/did/v1',
        id: did,
        publicKey: [{
          id: `${did}#keys-1`,
          type: 'Secp256k1VerificationKey2018',
          owner: did,
          ethereumAddress: identity
        }]
      })
    })
  })

  describe('owner changed', () => {
    let did, newOwner
    beforeAll(async () => {
      did = `did:ethr:${identity}`
      newOwner = accounts[2]
      await registry.changeOwner(identity, newOwner, {from: identity})
    })

    it('resolves document', () => {
      expect(resolve(did)).resolves.toEqual({
        '@context': 'https://w3id.org/did/v1',
        id: did,
        publicKey: [{
          id: `${did}#keys-1`,
          type: 'Secp256k1VerificationKey2018',
          owner: did,
          ethereumAddress: newOwner
        }]
      })
    })
  })

  describe('error handling', () => {
    it('rejects promise', () => {
      return expect(resolve('did:ethr:2nQtiQG6Cgm1GYTBaaKAgr76uY7iSexUkqX')).rejects.toEqual(new Error('Not a valid ethr DID: did:ethr:2nQtiQG6Cgm1GYTBaaKAgr76uY7iSexUkqX'))
    })
  })
})

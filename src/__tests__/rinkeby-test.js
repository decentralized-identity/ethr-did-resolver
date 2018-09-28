// TODO: remove this file
import Contract from 'truffle-contract'
import Web3 from 'web3'
import DidRegistryContract from 'ethr-did-registry'
import resolve from 'did-resolver'
import register from '../register'

it.only('does not work', async () => {
  const provider = new Web3.providers.HttpProvider('https://rinkeby.infura.io/ethr-did')
  const DidReg = Contract(DidRegistryContract)
  const web3 = new Web3()
  web3.setProvider(provider)
  DidReg.setProvider(provider)
  register({ provider, registry: '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b'})
  const did = 'did:ethr:0x9faefc1c2ed1e2e6e24ba269b5b882bd973821b4'
  const doc = await resolve(did)
  console.log(doc)
})
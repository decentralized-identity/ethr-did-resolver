import { Contract, ContractFactory } from '@ethersproject/contracts'
import { Resolvable, Resolver } from 'did-resolver'
import { getResolver } from '../resolver'
import { EthrDidController } from '../controller'
import { createProvider } from './testUtils'
import { arrayify } from '@ethersproject/bytes'
import { SigningKey } from '@ethersproject/signing-key'
import { default as EthereumDIDRegistry } from './EthereumDIDRegistry-Legacy/LegacyEthereumDIDRegistry.json'

jest.setTimeout(30000)

describe('nonce tracking compatability', () => {
  // let registry, accounts, did, identity, controller, delegate1, delegate2, ethr, didResolver
  let registryContract: Contract,
    accounts: string[],
    did: string,
    identity: string,
    controller: string,
    delegate1: string,
    delegate2: string,
    keyAgreementController: string,
    didResolver: Resolvable

  const web3Provider = createProvider()

  beforeAll(async () => {
    const factory = ContractFactory.fromSolidity(EthereumDIDRegistry).connect(web3Provider.getSigner(0))

    registryContract = await factory.deploy()
    registryContract = await registryContract.deployed()

    await registryContract.deployTransaction.wait()

    const registry = registryContract.address

    accounts = await web3Provider.listAccounts()

    identity = accounts[1]
    controller = accounts[2]
    delegate1 = accounts[3]
    delegate2 = accounts[4]
    keyAgreementController = accounts[5]
    did = `did:ethr:dev:${identity}`

    didResolver = new Resolver(getResolver({ name: 'dev', provider: web3Provider, registry }))
  })

  describe('nonce compatability', () => {
    it('changing owner two times should result in original owner wallet nonce increase', async () => {
      // Wallet signing the transaction
      const signer = accounts[1]
      // Current Owner of the Identity
      const originalOwner = accounts[2]
      // New owner of the Identity after change
      const nextOwner = accounts[3]
      // Final owner of the Identity
      const finalOwner = accounts[4]

      const identifier = `did:ethr:dev:${originalOwner}`

      const originalOwnerPrivateKey = arrayify('0x0000000000000000000000000000000000000000000000000000000000000002')
      const nextOwnerPrivateKey = arrayify('0x0000000000000000000000000000000000000000000000000000000000000003')

      console.log(await registryContract.functions.nonce(originalOwner))

      const hash = await new EthrDidController(identifier, registryContract).createChangeOwnerHash(nextOwner)
      const signature = new SigningKey(originalOwnerPrivateKey).signDigest(hash)

      await new EthrDidController(identifier, registryContract, web3Provider.getSigner(signer)).changeOwnerSigned(
        nextOwner,
        {
          sigV: signature.v,
          sigR: signature.r,
          sigS: signature.s,
        }
      )

      console.log(await registryContract.functions.nonce(originalOwner))

      const hash2 = await new EthrDidController(identifier, registryContract).createChangeOwnerHash(finalOwner)
      const signature2 = new SigningKey(nextOwnerPrivateKey).signDigest(hash2)

      await new EthrDidController(identifier, registryContract, web3Provider.getSigner(signer)).changeOwnerSigned(
        finalOwner,
        {
          sigV: signature2.v,
          sigR: signature2.r,
          sigS: signature2.s,
        }
      )

      console.log(await registryContract.functions.nonce(originalOwner))

      const nonce = await registryContract.functions.nonce(originalOwner)
      // Expect the nonce of the original identity to equal 2 as the nonce tracking in the legacy contract is
      // done on an identity basis
      expect(nonce[0]._hex).toEqual('0x02')
    })

    it('set attribute after owner change should result in original owner wallet nonce increase', async () => {
      const signer = accounts[1]
      const originalOwner = accounts[5]
      const nextOwner = accounts[6]

      const serviceEndpointParams = { uri: 'https://didcomm.example.com', transportType: 'http' }
      const attributeName = 'did/svc/testService'
      const attributeValue = JSON.stringify(serviceEndpointParams)
      const attributeExpiration = 86400

      const identifier = `did:ethr:dev:${originalOwner}`

      const originalOwnerPrivateKey = arrayify('0x0000000000000000000000000000000000000000000000000000000000000005')
      const nextOwnerPrivateKey = arrayify('0x0000000000000000000000000000000000000000000000000000000000000006')

      const hash = await new EthrDidController(identifier, registryContract).createChangeOwnerHash(nextOwner)
      const signature = new SigningKey(originalOwnerPrivateKey).signDigest(hash)

      await new EthrDidController(identifier, registryContract, web3Provider.getSigner(signer)).changeOwnerSigned(
        nextOwner,
        {
          sigV: signature.v,
          sigR: signature.r,
          sigS: signature.s,
        }
      )

      const hash2 = await new EthrDidController(identifier, registryContract).createSetAttributeHash(
        attributeName,
        attributeValue,
        attributeExpiration
      )
      const signature2 = new SigningKey(nextOwnerPrivateKey).signDigest(hash2)

      await new EthrDidController(identifier, registryContract, web3Provider.getSigner(signer)).setAttributeSigned(
        attributeName,
        attributeValue,
        attributeExpiration,
        {
          sigV: signature2.v,
          sigR: signature2.r,
          sigS: signature2.s,
        }
      )

      const nonce = await registryContract.functions.nonce(originalOwner)

      expect(nonce[0]._hex).toEqual('0x02')
    })
  })
})

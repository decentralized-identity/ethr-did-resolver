import { BrowserProvider, Contract, ContractFactory, getBytes, SigningKey } from 'ethers'
import { Resolvable, Resolver } from 'did-resolver'
import { getResolver } from '../resolver'
import { EthrDidController } from '../controller'
import { createProvider } from './testUtils'
import { default as LegacyEthereumDIDRegistry } from './EthereumDIDRegistry-Legacy/LegacyEthereumDIDRegistry.json'
import { default as EthereumDIDRegistry } from '../config/EthereumDIDRegistry.json'

jest.setTimeout(30000)

describe('nonce tracking', () => {
  // let registry, accounts, did, identity, controller, delegate1, delegate2, ethr, didResolver
  let legacyRegistryContract: Contract,
    registryContract: Contract,
    accounts: string[],
    did: string,
    legacyDid: string,
    identity: string,
    controller: string,
    delegate1: string,
    delegate2: string,
    keyAgreementController: string,
    didResolver: Resolvable

  let browserProvider: BrowserProvider

  beforeAll(async () => {
    browserProvider = createProvider()
    const legacyFactory = ContractFactory.fromSolidity(LegacyEthereumDIDRegistry).connect(
      await browserProvider.getSigner(0)
    )
    legacyRegistryContract = await legacyFactory.deploy()
    legacyRegistryContract = await legacyRegistryContract.waitForDeployment()
    const legacyRegistryAddress = await legacyRegistryContract.getAddress()

    const factory = ContractFactory.fromSolidity(EthereumDIDRegistry).connect(await browserProvider.getSigner(0))
    registryContract = await (await factory.deploy()).waitForDeployment()
    const registryAddress = await registryContract.getAddress()

    const accountSigners = await browserProvider.listAccounts()
    accounts = accountSigners.map((signer) => signer.address)

    identity = accounts[1]
    controller = accounts[2]
    delegate1 = accounts[3]
    delegate2 = accounts[4]
    keyAgreementController = accounts[5]
    legacyDid = `did:ethr:legacy:${identity}`
    did = `did:ethr:dev:${identity}`

    didResolver = new Resolver(
      getResolver({
        networks: [
          { name: 'legacy', provider: browserProvider, registry: legacyRegistryAddress },
          { name: 'dev', provider: browserProvider, registry: registryAddress },
        ],
      })
    )
  })
  describe('new contract', () => {
    it('changing owner two times should result in original owner wallet nonce increase only once', async () => {
      // Wallet signing the transaction
      const signer = accounts[1]
      // Current Owner of the Identity
      const originalOwner = accounts[2]
      // New owner of the Identity after change
      const nextOwner = accounts[3]
      // Final owner of the Identity
      const finalOwner = accounts[4]

      const identifier = `did:ethr:dev:${originalOwner}`

      const originalOwnerPrivateKey = getBytes('0x0000000000000000000000000000000000000000000000000000000000000002')
      const nextOwnerPrivateKey = getBytes('0x0000000000000000000000000000000000000000000000000000000000000003')

      const ethrController = new EthrDidController(
        identifier,
        registryContract,
        await browserProvider.getSigner(signer),
        undefined,
        undefined,
        undefined,
        undefined,
        false
      )

      const hash = await ethrController.createChangeOwnerHash(nextOwner)
      const signature = new SigningKey(originalOwnerPrivateKey).sign(hash)

      await ethrController.changeOwnerSigned(nextOwner, {
        sigV: signature.v,
        sigR: signature.r,
        sigS: signature.s,
      })

      const hash2 = await ethrController.createChangeOwnerHash(finalOwner)
      const signature2 = new SigningKey(nextOwnerPrivateKey).sign(hash2)

      await ethrController.changeOwnerSigned(finalOwner, {
        sigV: signature2.v,
        sigR: signature2.r,
        sigS: signature2.s,
      })

      const originalNonce: bigint = await registryContract.nonce(originalOwner)
      const signerNonce: bigint = await registryContract.nonce(nextOwner)
      expect(originalNonce).toEqual(1n)
      expect(signerNonce).toEqual(1n)
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

      const originalOwnerPrivateKey = getBytes('0x0000000000000000000000000000000000000000000000000000000000000005')
      const nextOwnerPrivateKey = getBytes('0x0000000000000000000000000000000000000000000000000000000000000006')

      const ethrController = new EthrDidController(
        identifier,
        registryContract,
        await browserProvider.getSigner(signer),
        undefined,
        undefined,
        undefined,
        undefined,
        false
      )

      const hash = await ethrController.createChangeOwnerHash(nextOwner)
      const signature = new SigningKey(originalOwnerPrivateKey).sign(hash)

      await ethrController.changeOwnerSigned(nextOwner, {
        sigV: signature.v,
        sigR: signature.r,
        sigS: signature.s,
      })

      const hash2 = await ethrController.createSetAttributeHash(attributeName, attributeValue, attributeExpiration)
      const signature2 = new SigningKey(nextOwnerPrivateKey).sign(hash2)

      await ethrController.setAttributeSigned(attributeName, attributeValue, attributeExpiration, {
        sigV: signature2.v,
        sigR: signature2.r,
        sigS: signature2.s,
      })

      const originalNonce = await registryContract.nonce(originalOwner)
      const signerNonce = await registryContract.nonce(nextOwner)
      expect(originalNonce).toEqual(1n)
      expect(signerNonce).toEqual(1n)
    })
  })
  describe('legacy contract', () => {
    it('changing owner two times should result in original owner wallet nonce increase', async () => {
      // Wallet signing the transaction
      const signer = accounts[1]
      // Current Owner of the Identity
      const originalOwner = accounts[2]
      // New owner of the Identity after change
      const nextOwner = accounts[3]
      // Final owner of the Identity
      const finalOwner = accounts[4]

      const identifier = `did:ethr:legacy:${originalOwner}`

      const originalOwnerPrivateKey = getBytes('0x0000000000000000000000000000000000000000000000000000000000000002')
      const nextOwnerPrivateKey = getBytes('0x0000000000000000000000000000000000000000000000000000000000000003')

      const hash = await new EthrDidController(identifier, legacyRegistryContract).createChangeOwnerHash(nextOwner)
      const signature = new SigningKey(originalOwnerPrivateKey).sign(hash)

      await new EthrDidController(
        identifier,
        legacyRegistryContract,
        await browserProvider.getSigner(signer)
      ).changeOwnerSigned(nextOwner, {
        sigV: signature.v,
        sigR: signature.r,
        sigS: signature.s,
      })

      const hash2 = await new EthrDidController(identifier, legacyRegistryContract).createChangeOwnerHash(finalOwner)
      const signature2 = new SigningKey(nextOwnerPrivateKey).sign(hash2)

      await new EthrDidController(
        identifier,
        legacyRegistryContract,
        await browserProvider.getSigner(signer)
      ).changeOwnerSigned(finalOwner, {
        sigV: signature2.v,
        sigR: signature2.r,
        sigS: signature2.s,
      })

      // Expect the nonce of the original identity to equal 2 as the nonce tracking in the legacy contract is
      // done on an identity basis
      const originalNonce = await legacyRegistryContract.nonce(originalOwner)
      const signerNonce = await legacyRegistryContract.nonce(nextOwner)
      expect(originalNonce).toEqual(2n)
      expect(signerNonce).toEqual(0n)
    })

    it('set attribute after owner change should result in original owner wallet nonce increase', async () => {
      const signer = accounts[1]
      const originalOwner = accounts[5]
      const nextOwner = accounts[6]

      const serviceEndpointParams = { uri: 'https://didcomm.example.com', transportType: 'http' }
      const attributeName = 'did/svc/testService'
      const attributeValue = JSON.stringify(serviceEndpointParams)
      const attributeExpiration = 86400

      const identifier = `did:ethr:legacy:${originalOwner}`

      const originalOwnerPrivateKey = getBytes('0x0000000000000000000000000000000000000000000000000000000000000005')
      const nextOwnerPrivateKey = getBytes('0x0000000000000000000000000000000000000000000000000000000000000006')

      const hash = await new EthrDidController(identifier, legacyRegistryContract).createChangeOwnerHash(nextOwner)
      const signature = new SigningKey(originalOwnerPrivateKey).sign(hash)

      await new EthrDidController(
        identifier,
        legacyRegistryContract,
        await browserProvider.getSigner(signer)
      ).changeOwnerSigned(nextOwner, {
        sigV: signature.v,
        sigR: signature.r,
        sigS: signature.s,
      })

      const hash2 = await new EthrDidController(identifier, legacyRegistryContract).createSetAttributeHash(
        attributeName,
        attributeValue,
        attributeExpiration
      )
      const signature2 = new SigningKey(nextOwnerPrivateKey).sign(hash2)

      await new EthrDidController(
        identifier,
        legacyRegistryContract,
        await browserProvider.getSigner(signer)
      ).setAttributeSigned(attributeName, attributeValue, attributeExpiration, {
        sigV: signature2.v,
        sigR: signature2.r,
        sigS: signature2.s,
      })

      const nonce = await legacyRegistryContract.nonce(originalOwner)

      expect(nonce).toEqual(2n)
    })
  })
})

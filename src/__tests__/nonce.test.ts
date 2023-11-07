import { Contract, ContractFactory, getBytes, SigningKey } from 'ethers'
import { EthrDidController } from '../controller'
import { default as LegacyEthereumDIDRegistry } from './EthereumDIDRegistry-Legacy/LegacyEthereumDIDRegistry.json'
import { deployRegistry, randomAccount } from './testUtils'
import { GanacheProvider } from '@ethers-ext/provider-ganache'

jest.setTimeout(30000)

describe('nonce tracking', () => {
  // let registry, accounts, did, identity, controller, delegate1, delegate2, ethr, didResolver
  let legacyRegistryContract: Contract, registryContract: Contract, provider: GanacheProvider

  beforeAll(async () => {
    let reg = await deployRegistry()
    provider = reg.provider
    registryContract = reg.registryContract

    const legacyFactory = ContractFactory.fromSolidity(LegacyEthereumDIDRegistry).connect(await provider.getSigner(0))
    legacyRegistryContract = await legacyFactory.deploy()
    legacyRegistryContract = await legacyRegistryContract.waitForDeployment()
  })

  describe('new contract', () => {
    it('changing owner two times should result in original owner wallet nonce increase only once', async () => {
      const { address: originalOwner, privKey: originalOwnerKey } = await randomAccount(provider)
      const { address: nextOwner, privKey: nextOwnerKey } = await randomAccount(provider)
      const { address: finalOwner } = await randomAccount(provider)

      const identifier = `did:ethr:dev:${originalOwner}`

      const ethrController = new EthrDidController(
        identifier,
        registryContract,
        await provider.getSigner(0),
        undefined,
        undefined,
        undefined,
        undefined,
        false
      )

      const hash = await ethrController.createChangeOwnerHash(nextOwner)
      const signature = originalOwnerKey.sign(hash)

      await ethrController.changeOwnerSigned(nextOwner, {
        sigV: signature.v,
        sigR: signature.r,
        sigS: signature.s,
      })

      const hash2 = await ethrController.createChangeOwnerHash(finalOwner)
      const signature2 = nextOwnerKey.sign(hash2)

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
      const { address: originalOwner, shortDID: identifier, privKey: originalOwnerKey } = await randomAccount(provider)
      const { address: nextOwner, privKey: nextOwnerKey } = await randomAccount(provider)

      const serviceEndpointParams = { uri: 'https://didcomm.example.com', transportType: 'http' }
      const attributeName = 'did/svc/testService'
      const attributeValue = JSON.stringify(serviceEndpointParams)
      const attributeExpiration = 86400

      const ethrController = new EthrDidController(
        identifier,
        registryContract,
        await provider.getSigner(0),
        undefined,
        undefined,
        undefined,
        undefined,
        false
      )

      const hash = await ethrController.createChangeOwnerHash(nextOwner)
      const signature = originalOwnerKey.sign(hash)

      await ethrController.changeOwnerSigned(nextOwner, {
        sigV: signature.v,
        sigR: signature.r,
        sigS: signature.s,
      })

      const hash2 = await ethrController.createSetAttributeHash(attributeName, attributeValue, attributeExpiration)
      const signature2 = nextOwnerKey.sign(hash2)

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
      const { address: originalOwner, privKey: originalOwnerKey } = await randomAccount(provider)
      const { address: nextOwner, privKey: nextOwnerKey } = await randomAccount(provider)
      const { address: finalOwner } = await randomAccount(provider)

      const identifier = `did:ethr:legacy:${originalOwner}`

      const hash = await new EthrDidController(identifier, legacyRegistryContract).createChangeOwnerHash(nextOwner)
      const signature = originalOwnerKey.sign(hash)

      await new EthrDidController(identifier, legacyRegistryContract, await provider.getSigner(0)).changeOwnerSigned(
        nextOwner,
        {
          sigV: signature.v,
          sigR: signature.r,
          sigS: signature.s,
        }
      )

      const hash2 = await new EthrDidController(identifier, legacyRegistryContract).createChangeOwnerHash(finalOwner)
      const signature2 = nextOwnerKey.sign(hash2)

      await new EthrDidController(identifier, legacyRegistryContract, await provider.getSigner(0)).changeOwnerSigned(
        finalOwner,
        {
          sigV: signature2.v,
          sigR: signature2.r,
          sigS: signature2.s,
        }
      )

      // Expect the nonce of the original identity to equal 2 as the nonce tracking in the legacy contract is
      // done on an identity basis
      const originalNonce = await legacyRegistryContract.nonce(originalOwner)
      const signerNonce = await legacyRegistryContract.nonce(nextOwner)
      expect(originalNonce).toEqual(2n)
      expect(signerNonce).toEqual(0n)
    })

    it('set attribute after owner change should result in original owner wallet nonce increase', async () => {
      const { address: originalOwner, privKey: originalOwnerKey } = await randomAccount(provider)
      const { address: nextOwner, privKey: nextOwnerKey } = await randomAccount(provider)

      const serviceEndpointParams = { uri: 'https://didcomm.example.com', transportType: 'http' }
      const attributeName = 'did/svc/testService'
      const attributeValue = JSON.stringify(serviceEndpointParams)
      const attributeExpiration = 86400

      const identifier = `did:ethr:legacy:${originalOwner}`

      const hash = await new EthrDidController(identifier, legacyRegistryContract).createChangeOwnerHash(nextOwner)
      const signature = originalOwnerKey.sign(hash)

      await new EthrDidController(identifier, legacyRegistryContract, await provider.getSigner(0)).changeOwnerSigned(
        nextOwner,
        {
          sigV: signature.v,
          sigR: signature.r,
          sigS: signature.s,
        }
      )

      const hash2 = await new EthrDidController(identifier, legacyRegistryContract).createSetAttributeHash(
        attributeName,
        attributeValue,
        attributeExpiration
      )
      const signature2 = nextOwnerKey.sign(hash2)

      await new EthrDidController(identifier, legacyRegistryContract, await provider.getSigner(0)).setAttributeSigned(
        attributeName,
        attributeValue,
        attributeExpiration,
        {
          sigV: signature2.v,
          sigR: signature2.r,
          sigS: signature2.s,
        }
      )

      const nonce = await legacyRegistryContract.nonce(originalOwner)

      expect(nonce).toEqual(2n)
    })
  })
})

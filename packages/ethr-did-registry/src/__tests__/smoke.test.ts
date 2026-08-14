import { expect } from 'chai'
import { before, describe, it } from 'mocha'
import { Wallet } from 'ethers'
import type { JsonRpcSigner, Provider } from 'ethers'
import hre from 'hardhat'
import { EthereumDIDRegistry__factory } from '../typechain-types/index.js'
import type { EthereumDIDRegistry } from '../typechain-types/index.js'

/**
 * Smoke test: proves the runner → network → deploy path that every ported
 * test relies on. Connects to the local EDR (hardhat) network via hre.network.create(),
 * deploys the registry through the generated typed factory, and reads a value/address
 * back over the same connection.
 */
describe('EthereumDIDRegistry deploys on the local hardhat network', () => {
  let registry: EthereumDIDRegistry
  let registryAddress: string
  let owner: string
  let provider: Provider

  before(async () => {
    const runtime = (await hre.network.create()) as unknown as {
      ethers: { getSigners: () => Promise<JsonRpcSigner[]>; provider: Provider }
    }
    const { ethers } = runtime
    const [signer] = await ethers.getSigners()
    owner = await signer.getAddress()

    const registryDeployed = await new EthereumDIDRegistry__factory(signer).deploy()
    await registryDeployed.waitForDeployment()
    registry = registryDeployed
    registryAddress = await registryDeployed.getAddress()
    provider = ethers.provider
  })

  it('deploys to the EDR network at a non-zero address with code on-chain', async () => {
    expect(registryAddress).to.match(/^0x[0-9a-fA-F]{40}$/)
    expect(registryAddress).not.to.equal('0x' + '0'.repeat(40))
    expect(await provider.getCode(registryAddress)).not.to.equal('0x')
  })

  it('reads back the default owner: an unregistered identity owns itself', async () => {
    const identity = Wallet.createRandom().address
    expect(await registry.identityOwner(identity)).to.equal(identity)
  })

  it('changeOwner writes and identityOwner reads back the new owner', async () => {
    const newOwner = Wallet.createRandom().address
    const tx = await registry.changeOwner(owner, newOwner)
    await tx.wait()
    expect(await registry.identityOwner(owner)).to.equal(newOwner)
  })
})

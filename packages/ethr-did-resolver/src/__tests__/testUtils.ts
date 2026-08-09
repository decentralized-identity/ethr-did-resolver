import { BrowserProvider, Contract, ContractFactory, ethers, NonceManager, Provider, SigningKey } from 'ethers'
import hre from 'hardhat'
import { Resolver } from 'did-resolver'
import { getResolver } from '../resolver'
import { EthereumDIDRegistry } from '../config/EthereumDIDRegistry'
import { vi } from 'vitest'

type NetworkConnection = Awaited<ReturnType<typeof hre.network.connect>>

let _connection: NetworkConnection | null = null

export async function deployRegistry(): Promise<{
  registryContract: Contract
  provider: BrowserProvider
  didResolver: Resolver
}> {
  _connection = await hre.network.connect('hardhat')
  const provider = new BrowserProvider(_connection.provider, undefined, { cacheTimeout: -1 })
  const factory = ContractFactory.fromSolidity(EthereumDIDRegistry).connect(await provider.getSigner(0))

  const registryContract: Contract = await (await factory.deploy()).waitForDeployment()
  const registry = await registryContract.getAddress()

  const didResolver = new Resolver(getResolver({ name: 'dev', provider: provider, registry }))

  return { registryContract, didResolver, provider }
}

export async function sleep(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

export async function stopMining(provider: BrowserProvider): Promise<unknown> {
  return provider.send('evm_setAutomine', [false])
}

export async function startMining(provider: BrowserProvider): Promise<unknown> {
  await provider.send('evm_setAutomine', [true])
  return provider.send('evm_mine', [])
}

/**
 * Mocks the provider so that getBlock('finalized') returns a block at the current
 * latest height. This forces the cachedProvider's finalized tracker to consider
 * all fetched blocks as finalized (and therefore cacheable).
 */
export function mockFinalizedAsLatest(provider: Provider): void {
  const origGetBlock = provider.getBlock.bind(provider)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.spyOn(provider, 'getBlock').mockImplementation(async (blockTag: any) => {
    if (blockTag === 'finalized') {
      return await origGetBlock('latest')
    }
    return origGetBlock(blockTag)
  })
}

export async function randomAccount(provider: BrowserProvider): Promise<{
  privKey: SigningKey
  address: string
  shortDID: string
  longDID: string
  pubKey: string
  signer: NonceManager
}> {
  const privKey = new ethers.SigningKey(ethers.randomBytes(32))
  const pubKey = privKey.compressedPublicKey
  const wallet = new ethers.Wallet(privKey, provider)
  const signer = new NonceManager(wallet)
  const address = await wallet.getAddress()
  const shortDID = `did:ethr:dev:${address}`
  const longDID = `did:ethr:dev:${pubKey}`
  await provider.send('hardhat_setBalance', [address, '0x1000000000000000000000'])
  return { privKey, pubKey, signer, address, shortDID, longDID }
}

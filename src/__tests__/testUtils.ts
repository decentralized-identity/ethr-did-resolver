import { BrowserProvider, Contract, ContractFactory, ethers, NonceManager, SigningKey } from 'ethers'
import hre from 'hardhat'
type NetworkConnection = Awaited<ReturnType<typeof hre.network.connect>>
import { Resolver } from 'did-resolver'
import { getResolver } from '../resolver'
import { EthereumDIDRegistry } from '../config/EthereumDIDRegistry'

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

import { Contract, ContractFactory, ethers, SigningKey, Wallet } from 'ethers'
import { GanacheProvider } from '@ethers-ext/provider-ganache'
import { Resolver } from 'did-resolver'
import { getResolver } from '../resolver'
import { EthereumDIDRegistry } from '../config/EthereumDIDRegistry'

export async function deployRegistry(): Promise<{
  registryContract: Contract
  provider: GanacheProvider
  didResolver: Resolver
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provider = new GanacheProvider({ logging: { quiet: true } } as any)
  const factory = ContractFactory.fromSolidity(EthereumDIDRegistry).connect(await provider.getSigner(0))

  const registryContract: Contract = await (await factory.deploy()).waitForDeployment()
  const registry = await registryContract.getAddress()

  const didResolver = new Resolver(getResolver({ name: 'dev', provider: provider, registry }))

  return { registryContract, didResolver, provider }
}

export async function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export async function stopMining(provider: GanacheProvider): Promise<unknown> {
  return provider.send('miner_stop', [])
}

export async function startMining(provider: GanacheProvider): Promise<unknown> {
  return provider.send('miner_start', [1])
}

export async function randomAccount(provider: GanacheProvider): Promise<{
  privKey: SigningKey
  address: string
  shortDID: string
  longDID: string
  pubKey: string
  signer: Wallet
}> {
  const privKey = new ethers.SigningKey(ethers.randomBytes(32))
  const pubKey = privKey.compressedPublicKey
  const signer = new ethers.Wallet(privKey, provider)
  const address = await signer.getAddress()
  const shortDID = `did:ethr:dev:${address}`
  const longDID = `did:ethr:dev:${pubKey}`
  await provider.setAccount(address, {
    balance: '0x1000000000000000000000',
  })
  return { privKey, pubKey, signer, address, shortDID, longDID }
}

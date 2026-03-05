import { readFileSync } from 'fs'
import { Resolver } from 'did-resolver'
import { getResolver, stringToBytes32 } from 'ethr-did-resolver'
import { createPublicClient, createWalletClient, http, encodeFunctionData, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { anvil as anvilChain } from 'viem/chains'

async function main() {
  const env = JSON.parse(readFileSync('/tmp/ethr-7702-test-env.json', 'utf-8'))
  const { rpcUrl, chainId, contracts } = env

  const privateKey = '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a'
  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const eoaAddress = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65'

  const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) })
  const walletClient = createWalletClient({ chain: anvilChain, transport: http(rpcUrl), account })

  const authorization = await walletClient.signAuthorization({
    contractAddress: contracts.didManager,
    executor: 'self',
  })

  const DID_MANAGER_ABI = [{
    name: 'setAttributeForIdentity', type: 'function',
    inputs: [
      { name: 'registry', type: 'address' },
      { name: 'name', type: 'bytes32' },
      { name: 'value', type: 'bytes' },
      { name: 'validity', type: 'uint256' },
    ],
    outputs: [], stateMutability: 'nonpayable',
  }] as const

  const attrName = stringToBytes32('did/pub/Ed25519/veriKey/base64') as `0x${string}`
  const attrValue = toHex(new TextEncoder().encode('base64encodedpubkey'))
  const data = encodeFunctionData({
    abi: DID_MANAGER_ABI,
    functionName: 'setAttributeForIdentity',
    args: [contracts.registry, attrName, attrValue, 86400n],
  })

  const hash = await walletClient.sendTransaction({
    authorizationList: [authorization],
    to: eoaAddress as `0x${string}`,
    data,
    chain: anvilChain,
    account,
  })

  await publicClient.waitForTransactionReceipt({ hash })

  const resolver = new Resolver(
    getResolver({ networks: [{ name: 'dev', chainId, rpcUrl, registry: contracts.registry }] })
  )

  const did = `did:ethr:dev:${eoaAddress}`
  const result = await resolver.resolve(did)
  console.log(JSON.stringify(result.didDocument, null, 2))
}

main().catch(console.error)

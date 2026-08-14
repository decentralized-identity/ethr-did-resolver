// test/infrastructure.test.ts
// Verify ERC-1056 deployment and DID resolution

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { Resolver } from 'did-resolver'
import { getResolver, EthereumDIDRegistry, stringToBytes32 } from 'ethr-did-resolver'
import { JsonRpcProvider, Contract, Wallet } from 'ethers'
import { TEST_ENV_FILE } from './globalSetup.js'
import { getAnvilAccounts, getAnvilPrivateKeys } from '../src/utils/anvil.js'

type TestEnv = {
  rpcUrl: string
  chainId: number
  contracts: { registry: string }
}

function loadEnv(): TestEnv {
  return JSON.parse(readFileSync(TEST_ENV_FILE, 'utf-8'))
}

describe('Infrastructure', () => {
  it('resolves a default DID document for a local identity', async () => {
    const { rpcUrl, chainId, contracts } = loadEnv()
    const address = getAnvilAccounts()[1] // use account[1] as the identity

    const provider = new JsonRpcProvider(rpcUrl)
    const resolver = new Resolver(
      getResolver({
        networks: [
          {
            name: 'dev',
            chainId,
            rpcUrl,
            registry: contracts.registry,
          },
        ],
      })
    )

    const did = `did:ethr:dev:${address}`
    const result = await resolver.resolve(did)

    expect(result.didResolutionMetadata.error).toBeUndefined()
    const doc = result.didDocument!
    expect(doc.id).toBe(did)
    expect(doc.verificationMethod).toHaveLength(1)
    expect(doc.verificationMethod![0].blockchainAccountId).toMatch(
      new RegExp(address.toLowerCase(), 'i')
    )
    expect(doc.authentication).toContain(`${did}#controller`)
  })

  it('can call setAttribute and see it reflected in the DID document', async () => {
    const { rpcUrl, chainId, contracts } = loadEnv()
    const accounts = getAnvilAccounts()
    const keys = getAnvilPrivateKeys()
    const address = accounts[2]
    const privateKey = keys[2]

    const provider = new JsonRpcProvider(rpcUrl)
    const signer = new Wallet(privateKey, provider)

    // Call setAttribute directly via ethers
    const registry = new Contract(contracts.registry, EthereumDIDRegistry.abi, signer)

    // setAttribute(identity, name, value, validity)
    const attrName = stringToBytes32('did/pub/Ed25519/veriKey/base64')
    const attrValue = new TextEncoder().encode('test-key-value')
    const validity = 86400 // 1 day in seconds

    const tx = await registry.setAttribute(address, attrName, attrValue, validity)
    await tx.wait()

    const resolver = new Resolver(
      getResolver({
        networks: [
          {
            name: 'dev',
            chainId,
            rpcUrl,
            registry: contracts.registry,
          },
        ],
      })
    )

    const did = `did:ethr:dev:${address}`
    const result = await resolver.resolve(did)

    expect(result.didResolutionMetadata.error).toBeUndefined()
    // After setAttribute, the DID document should have an additional verification method
    expect(result.didDocument!.verificationMethod!.length).toBeGreaterThan(1)
  })
})

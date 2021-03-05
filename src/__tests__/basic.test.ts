import { AlchemyProvider, EtherscanProvider, InfuraProvider, WebSocketProvider } from '@ethersproject/providers'
import { EthrDidResolver } from '../resolver'

const rinkebyConfig = { networks: [{ name: 'rinkeby', provider: new InfuraProvider('rinkeby') }] }

describe('resolver', () => {

  afterAll(() => {
    //when using websocket providers, we need to make sure they get closed
    (rinkebyConfig.networks[0].provider as any)?.destroy()
  })

  it('calls getOwner', async () => {
    const resolver = new EthrDidResolver(rinkebyConfig)
    const owner = await resolver.getOwner('0xb2dfca2ca34bde773a84554c063ac45ee6b1dc45', 'rinkeby', 'latest')
    console.log(owner)
    //nop
    //did:ethr:rinkeby:0xb2dfca2ca34bde773a84554c063ac45ee6b1dc45 has an owner change to 0x4720964e0a5fe5ab3feadf0f1effb03d45285bfe
  })

  it('calls previous change', async () => {
    const resolver = new EthrDidResolver(rinkebyConfig)
    const result = await resolver.previousChange('0x3e4b6c1be23b87fe0fe7ffedc9e705519dd024e8', 'rinkeby', 'latest')
    console.log(result)
    //nop
    //did:ethr:rinkeby:0xb2dfca2ca34bde773a84554c063ac45ee6b1dc45 has an owner change to 0x4720964e0a5fe5ab3feadf0f1effb03d45285bfe
  })

  it.skip('calls getLogs', async () => {
    const resolver = new EthrDidResolver(rinkebyConfig)
    const result = await resolver.changeLog('0x3e4b6c1be23b87fe0fe7ffedc9e705519dd024e8', 'rinkeby', 'latest')
    // console.log(result)
    //nop
    //did:ethr:rinkeby:0xb2dfca2ca34bde773a84554c063ac45ee6b1dc45 has an owner change to 0x4720964e0a5fe5ab3feadf0f1effb03d45285bfe
  })

})

// import 'jest-extended'

// import { EthrStatusRegistry } from '../index'
// import { EthrCredentialRevoker } from '../EthrCredentialRevoker'
// import * as RevocationRegistryContract from 'revocation-registry'
// import * as ganache from 'ganache-cli'
// import { DIDDocument } from 'did-resolver'
// import { SimpleSigner, createJWT } from 'did-jwt'
// import { Web3Provider, JsonRpcProvider } from '@ethersproject/providers'
// import { sign } from 'ethjs-signer'
// import { hexlify } from '@ethersproject/bytes'
// import { parseEther } from '@ethersproject/units'
// import { ContractFactory } from '@ethersproject/contracts'

// const privateKey = 'a285ab66393c5fdda46d6fbad9e27fafd438254ab72ad5acb681a0e9f20f5d7b'

// const signerAddress = '0x2036C6CD85692F0Fb2C26E6c6B2ECed9e4478Dfd'
// const issuer: string = `did:ethr:${signerAddress}`
// const signer = SimpleSigner(privateKey)

// describe('EthrStatusRegistry', () => {
//   const provider = new Web3Provider(
//     ganache.provider({
//       accounts: [
//         {
//           balance: hexlify(parseEther('1000'))
//         },
//         {
//           secretKey: '0x' + privateKey,
//           balance: hexlify(parseEther('1000'))
//         }
//       ]
//     })
//   )

//   const localNetworkConfig = { networks: [{ name: 'ganache', provider: provider }] }

//   let registry, referenceDoc: DIDDocument, statusEntry: object

//   beforeAll(async () => {
//     const factory = new ContractFactory(
//       RevocationRegistryContract.abi,
//       RevocationRegistryContract.bytecode,
//       provider.getSigner(0)
//     )

//     const deployment = await factory.deploy()
//     registry = deployment.address
//     await deployment.deployed()

//     referenceDoc = {
//       '@context': 'https://w3id.org/did/v1',
//       id: issuer,
//       authentication: [
//         {
//           type: 'Secp256k1SignatureAuthentication2018',
//           publicKey: `${issuer}#owner`
//         }
//       ],
//       publicKey: [
//         {
//           id: `${issuer}#owner`,
//           type: 'Secp256k1VerificationKey2018',
//           ethereumAddress: signerAddress
//         }
//       ]
//     } as DIDDocument

//     statusEntry = {
//       type: 'EthrStatusRegistry2019',
//       id: `ganache:${registry}`
//     }
//   })

//   describe('happy path', () => {
//     it(`should ignore non-revocable credentials`, async () => {
//       const token = await createJWT({}, { issuer, signer })
//       const statusChecker = new EthrStatusRegistry({ infuraProjectId: 'none' })
//       await expect(statusChecker.checkStatus(token, referenceDoc)).resolves.toMatchObject({ status: 'NonRevocable' })
//     })

//     it(`round trip; should create, revoke and verify a credential with revoked status`, async () => {
//       const token = await createJWT({ credentialStatus: statusEntry }, { issuer, signer })

//       const ethSigner = (rawTx: any, cb: any) => cb(null, sign(rawTx, '0x' + privateKey))

//       const revoker = new EthrCredentialRevoker(localNetworkConfig)
//       const txHash = await revoker.revoke(token, ethSigner)
//       const mined = await provider.waitForTransaction(txHash)

//       const statusChecker = new EthrStatusRegistry(localNetworkConfig)

//       await expect(statusChecker.checkStatus(token, referenceDoc)).resolves.toMatchObject({
//         revoked: true
//       })
//     })

//     it(`should return revoked status for real credential`, async () => {
//       const referenceToken =
//         'eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NksifQ.eyJpYXQiOjE1ODgxNzE4MDAsInN1YiI6ImRpZDp3ZWI6dXBvcnQubWUiLCJub25jZSI6IjM4NzE4Njc0NTMiLCJ2YyI6eyJAY29udGV4dCI6WyJodHRwczovL3d3dy53My5vcmcvMjAxOC9jcmVkZW50aWFscy92MSJdLCJ0eXBlIjpbIlZlcmlmaWFibGVDcmVkZW50aWFsIiwiQXdlc29tZW5lc3NDcmVkZW50aWFsIl0sImNyZWRlbnRpYWxTdWJqZWN0Ijp7Iml0IjoicmVhbGx5IHdoaXBzIHRoZSBsbGFtbWEncyBhc3MhIn19LCJjcmVkZW50aWFsU3RhdHVzIjp7InR5cGUiOiJFdGhyU3RhdHVzUmVnaXN0cnkyMDE5IiwiaWQiOiJyaW5rZWJ5OjB4OTdmZDI3ODkyY2RjRDAzNWRBZTFmZTcxMjM1YzYzNjA0NEI1OTM0OCJ9LCJpc3MiOiJkaWQ6ZXRocjoweDU0ZDU5ZTNmZmQ3NjkxN2Y2MmRiNzAyYWMzNTRiMTdmMzg0Mjk1NWUifQ.kpUbDVrs3ouIs0vb5IqL4_FAErANCZnFE-lTMlC9Hzpwa4u3_8BaJg4y1KIHq_ROr2oEam9UAujd5A4FbbzFoA'

//       // proj ID only usable for this test
//       const statusChecker = new EthrStatusRegistry({ infuraProjectId: 'ec9c99d75b834bac8dd4bfacad8cfdf7' })

//       const referenceDoc = {
//         id: 'did:ethr:0x54d59e3ffd76917f62db702ac354b17f3842955e',
//         publicKey: [
//           {
//             id: 'did:ethr:0x54d59e3ffd76917f62db702ac354b17f3842955e#owner',
//             type: 'Secp256k1VerificationKey2018',
//             ethereumAddress: '0x54d59e3ffd76917f62db702ac354b17f3842955e'
//           }
//         ]
//       } as DIDDocument

//       await expect(statusChecker.checkStatus(referenceToken, referenceDoc)).resolves.toMatchObject({
//         revoked: true
//       })
//     })

//     it(`should return valid credential status for fresh credential`, async () => {
//       const token = await createJWT({ credentialStatus: statusEntry }, { issuer, signer })
//       const statusChecker = new EthrStatusRegistry(localNetworkConfig)
//       await expect(statusChecker.checkStatus(token, referenceDoc)).resolves.toMatchObject({
//         revoked: false
//       })
//     })

//     it(`should override transaction options`, async () => {
//       const token = await createJWT({ credentialStatus: statusEntry }, { issuer, signer })

//       const ethSigner = (rawTx: any, cb: any) => cb(null, sign(rawTx, '0x' + privateKey))

//       const revoker = new EthrCredentialRevoker(localNetworkConfig)
//       const txHash = await revoker.revoke(token, ethSigner, { gasLimit: 45123, gasPrice: 123456789 })
//       const minedTransaction = await provider.getTransaction(txHash)

//       expect(minedTransaction.gasLimit.toNumber()).toBe(45123)
//       expect(minedTransaction.gasPrice.toNumber()).toBe(123456789)
//     })
//   })

//   describe('error scenarios', () => {
//     it(`should throw when revoking same credential twice`, async () => {
//       const token = await createJWT({ credentialStatus: statusEntry }, { issuer, signer })

//       const ethSigner = (rawTx: any, cb: any) => cb(null, sign(rawTx, '0x' + privateKey))

//       const revoker = new EthrCredentialRevoker(localNetworkConfig)
//       await revoker.revoke(token, ethSigner)
//       await expect(revoker.revoke(token, ethSigner)).rejects.toThrow(/credential_already_revoked/)
//     })

//     it('should be able to instantiate Status using infura ID', () => {
//       expect(new EthrStatusRegistry({ infuraProjectId: 'none' })).not.toBeNil()
//     })

//     it('should be able to instantiate Status using single network definition', () => {
//       expect(new EthrStatusRegistry({ rpcUrl: 'example.com' })).not.toBeNil()
//     })

//     it('should be able to instantiate Status using multiple network definitions', () => {
//       expect(
//         new EthrStatusRegistry({
//           networks: [
//             { name: 'mainnet', rpcUrl: 'example.com' },
//             { name: 'rinkeby', rpcUrl: 'rinkeby.example.com' },
//             { name: 'local', provider: new JsonRpcProvider('http://localhost:8545') }
//           ]
//         })
//       ).not.toBeNil()
//     })

//     it('should have proper signature for "asMethodName"', () => {
//       let mapping = new EthrStatusRegistry({ infuraProjectId: 'none' }).asStatusMethod
//       expect(mapping['EthrStatusRegistry2019']).toBeFunction
//     })

//     it(`should reject unknown status method`, async () => {
//       const token = await createJWT(
//         { credentialStatus: { type: 'unknown', id: 'something something' } },
//         { issuer, signer }
//       )
//       const statusChecker = new EthrStatusRegistry({ infuraProjectId: 'none' })
//       await expect(statusChecker.checkStatus(token, referenceDoc)).rejects.toMatch(
//         'unsupported credential status method'
//       )
//     })

//     it(`should reject unknown networkIDs`, async () => {
//       const token = await createJWT({ credentialStatus: statusEntry }, { issuer, signer })
//       const statusChecker = new EthrStatusRegistry({
//         networks: [{ name: 'some net', rpcUrl: 'example.com' }]
//       })
//       await expect(statusChecker.checkStatus(token, referenceDoc)).rejects.toMatch(
//         'networkId (ganache) for status check not configured'
//       )
//     })

//     it(`should throw an error when the RPC endpoint is mis-configured`, async () => {
//       const token = await createJWT({ credentialStatus: statusEntry }, { issuer, signer })
//       const statusChecker = new EthrStatusRegistry({
//         networks: [{ name: 'ganache', rpcUrl: '0.0.0.0' }]
//       })

//       await expect(statusChecker.checkStatus(token, referenceDoc)).rejects.toThrow(/CONNECTION ERROR/)
//     })

//     it(`should throw when revoking non-revocable credential`, async () => {
//       const token = await createJWT({}, { issuer, signer })

//       const revoker = new EthrCredentialRevoker(localNetworkConfig)
//       await expect(revoker.revoke(token)).rejects.toThrow(/credential_not_revocable; no status field embedded/)
//     })

//     it(`should throw when revoking non-revocable credential because of malformed ID`, async () => {
//       const token = await createJWT(
//         { credentialStatus: { type: 'EthrStatusRegistry2019', id: 'bad id' } },
//         { issuer, signer }
//       )

//       const revoker = new EthrCredentialRevoker(localNetworkConfig)
//       await expect(revoker.revoke(token)).rejects.toThrow(
//         /credential_not_revocable; malformed `id` field in credential status entry/
//       )
//     })

//     it(`should throw when revoking credential with misconfigured network`, async () => {
//       const token = await createJWT({ credentialStatus: statusEntry }, { issuer, signer })
//       const revoker = new EthrCredentialRevoker({})
//       await expect(revoker.revoke(token)).rejects.toThrow(/credential_not_revocable; no known way to access network/)
//     })
//   })
// })

// it('throws when trying to resolve a non configured network', async () => {
//   const did = 'did:ethr:nonconf:' + addr
//   const ethr = getResolver({ networks: [{ name: 'existent', rpcUrl: 'http://localhost:7545' }] })
//   const resolver = new Resolver(ethr)
//   await expect(resolver.resolve(did)).rejects.toThrow('No conf for networkId: nonconf')
// })

// it('throws when trying to resolve mainnet on a config with only private networks', async () => {
//   const did = 'did:ethr:' + addr
//   const ethr = getResolver({ networks: [{ name: '0x4', rpcUrl: 'http://localhost:7545' }] })
//   const resolver = new Resolver(ethr)
//   await expect(resolver.resolve(did)).rejects.toThrow('No conf for networkId: mainnet')
// })

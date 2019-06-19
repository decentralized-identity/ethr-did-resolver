import resolve from 'did-resolver'
import register from '../register'

describe('ethrResolver (alt-chains)', () => {

    let addr;

    beforeAll(async () => {
        addr = '0xd0dbe9d3698738f899ccd8ee27ff2347a7faa4dd'
        register()
    })

    describe('eth-testnets', () => {

        it('resolves on ropsten', () => {
            const did='did:ethr:ropsten:'+addr;
            return expect(resolve(did)).resolves.toEqual({
                '@context': 'https://w3id.org/did/v1',
                id: did,
                publicKey: [
                    {
                        id: `${did}#owner`,
                        type: 'Secp256k1VerificationKey2018',
                        owner: did,
                        ethereumAddress: addr,
                    },
                ],
                authentication: [
                    {
                        type: 'Secp256k1SignatureAuthentication2018',
                        publicKey: `${did}#owner`,
                    },
                ],
            })
        })

        it('resolves on rinkeby', () => {
            const did='did:ethr:rinkeby:'+addr;
            return expect(resolve(did)).resolves.toEqual({
                '@context': 'https://w3id.org/did/v1',
                id: did,
                publicKey: [
                    {
                        id: `${did}#owner`,
                        type: 'Secp256k1VerificationKey2018',
                        owner: did,
                        ethereumAddress: addr,
                    },
                ],
                authentication: [
                    {
                        type: 'Secp256k1SignatureAuthentication2018',
                        publicKey: `${did}#owner`,
                    },
                ],
            })
        })

        it('resolves on kovan', () => {
            const did='did:ethr:kovan:'+addr;
            return expect(resolve(did)).resolves.toEqual({
                '@context': 'https://w3id.org/did/v1',
                id: did,
                publicKey: [
                    {
                        id: `${did}#owner`,
                        type: 'Secp256k1VerificationKey2018',
                        owner: did,
                        ethereumAddress: addr,
                    },
                ],
                authentication: [
                    {
                        type: 'Secp256k1SignatureAuthentication2018',
                        publicKey: `${did}#owner`,
                    },
                ],
            })
        })

        it.skip('resolves on rsk', () => {
            const did='did:ethr:rsk:'+addr;
            return expect(resolve(did)).resolves.toEqual({
                '@context': 'https://w3id.org/did/v1',
                id: did,
                publicKey: [
                    {
                        id: `${did}#owner`,
                        type: 'Secp256k1VerificationKey2018',
                        owner: did,
                        ethereumAddress: addr,
                    },
                ],
                authentication: [
                    {
                        type: 'Secp256k1SignatureAuthentication2018',
                        publicKey: `${did}#owner`,
                    },
                ],
            })
        })

        it.skip('resolves on rsk:testnet', () => {
            const did='did:ethr:rsk:testnet:'+addr;
            return expect(resolve(did)).resolves.toEqual({
                '@context': 'https://w3id.org/did/v1',
                id: did,
                publicKey: [
                    {
                        id: `${did}#owner`,
                        type: 'Secp256k1VerificationKey2018',
                        owner: did,
                        ethereumAddress: addr,
                    },
                ],
                authentication: [
                    {
                        type: 'Secp256k1SignatureAuthentication2018',
                        publicKey: `${did}#owner`,
                    },
                ],
            })
        })

        it.skip('resolves on alastria:telsius', () => {
            register({ 
                networks:[
                    { 
                        name: 'alastria:telsius', 
                        rpcUrl: '(need alastria public rpc endpoint)', 
                        registry: '0x05cc574b19a3c11308f761b3d7263bd8608bc532' }
                ]
            })
            const did='did:ethr:alastria:telsius:'+addr;
            return expect(resolve(did)).resolves.toEqual({
                '@context': 'https://w3id.org/did/v1',
                id: did,
                publicKey: [
                    {
                        id: `${did}#owner`,
                        type: 'Secp256k1VerificationKey2018',
                        owner: did,
                        ethereumAddress: addr,
                    },
                ],
                authentication: [
                    {
                        type: 'Secp256k1SignatureAuthentication2018',
                        publicKey: `${did}#owner`,
                    },
                ],
            })
        })

    })


})

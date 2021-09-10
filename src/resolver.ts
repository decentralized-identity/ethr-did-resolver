import ENS, { getEnsAddress } from '@ensdomains/ensjs'
import { JsonRpcProvider } from '@ethersproject/providers'
import {
  DIDDocument,
  DIDResolutionOptions,
  DIDResolutionResult,
  DIDResolver,
  ParsedDID,
  Resolvable,
  ServiceEndpoint,
  VerificationMethod,
} from 'did-resolver'

export function getResolver(): Record<string, DIDResolver> {
  async function resolve(did: string, parsed: ParsedDID): Promise<DIDResolutionResult> {
    // FIXME: TODO: provide as parameter
    const provider = new JsonRpcProvider('https://ropsten.infura.io/v3/e471b8639c314004ae67ec0078f70102')
    const ens = new ENS({ provider, ensAddress: getEnsAddress('1') })
    let err: string | null = null
    let address = null
    try {
      address = await ens.name(parsed.id).getAddress()
    } catch (error) {
      err = `resolver_error: Cannot resolve ENS name: ${error}`
    }

    const didDocumentMetadata = {}
    let didDocument: DIDDocument | null = null

    if (address) {
      const chainId = (await provider.getNetwork()).chainId
      const blockchainAccountId = `${address}@eip155:${chainId}`
      // FIXME: TODO:
      const postfix = address

      // setup default did doc
      didDocument = {
        id: did,
        service: [{
          id: `${did}#Web3PublicProfile-${postfix}`,
          type: "Web3PublicProfile", 
          serviceEndpoint: parsed.id
        }],
        verificationMethod: [{
          id: `${did}#${postfix}`,
          type: 'EcdsaSecp256k1RecoveryMethod2020',
          controller: did,
          blockchainAccountId
        }],
        authentication: [ `${did}#${postfix}` ],        
        capabilityDelegation: [ `${did}#${postfix}` ],
        capabilityInvocation: [ `${did}#${postfix}` ],
        assertionMethod:  [ `${did}#${postfix}` ]
      }
    }

    const services: ServiceEndpoint[] = await ens.name(parsed.id).getText('org.w3c.did.service')      
    if (services) {
      console.log('service stuff')
    }

    const stuff = await ens.name(parsed.id).getText('org.w3c.did.verificationMethod')
    console.log('stuff: ' + stuff)

    const verificationMethods: VerificationMethod[] = JSON.parse('{' + stuff + '}')
    if (verificationMethods) {
      console.log('verificationMethod:' + JSON.stringify(verificationMethods))
    }

    const filterValidVerificationMethods = (current: (string | VerificationMethod)[], all: (string | VerificationMethod)[]) : (string | VerificationMethod)[] => {
      return current.filter(e => (typeof e === 'string' || e instanceof String) && e.startsWith('#') && verificationMethods?.some(all => all.id === e))
    }

    // let verificationMethod: (string | VerificationMethod)[] = await ens.name(parsed.id).getText('org.w3c.did.authentication')      
    // if (verificationMethod) {
    //   verificationMethod = filterValidVerificationMethods(verificationMethod, verificationMethods)
    //   if (didDocument && verificationMethod) {
    //     didDocument.authentication = didDocument.authentication?.concat(verificationMethod)
    //   }

    //   console.log('authentication:' + JSON.stringify(verificationMethod))
    // }

    let verificationMethod = await ens.name(parsed.id).getText('org.w3c.did.keyAgreement')      
    if (verificationMethod) {
      if (typeof verificationMethod[0] === 'string') {
        console.log('1')
      }
      if (verificationMethod[0] instanceof String) {
        console.log('2')
      }
      if (verificationMethod[0].startsWith('#')) {
        console.log('3')
      }
      if (verificationMethods?.some(item => item.id === verificationMethod[0])) {
        console.log('4')
      }      

      verificationMethod = filterValidVerificationMethods(verificationMethod, verificationMethods)
      if (didDocument && verificationMethod) {
        didDocument.keyAgreement = didDocument.keyAgreement?.concat(verificationMethod)
      }

      console.log('keyAgreement:' + JSON.stringify(verificationMethod))
    }

    // verificationMethod = await ens.name(parsed.id).getText('org.w3c.did.assertionMethod')      
    // if (verificationMethod) {      
    //   verificationMethod = filterValidVerificationMethods(verificationMethod, verificationMethods)
    //   if (didDocument && verificationMethod) {
    //     didDocument.assertionMethod = didDocument.assertionMethod?.concat(verificationMethod)
    //   }

    //   console.log('assertionMethod:' + JSON.stringify(verificationMethod))
    // }

    // verificationMethod = await ens.name(parsed.id).getText('org.w3c.did.capabilityInvocation')      
    // if (verificationMethod) {
    //   verificationMethod = filterValidVerificationMethods(verificationMethod, verificationMethods)
    //   if (didDocument && verificationMethod) {
    //     didDocument.capabilityInvocation = didDocument.capabilityInvocation?.concat(verificationMethod)
    //   }

    //   console.log('capabilitiesInvocation:' + JSON.stringify(verificationMethod))
    // }

    // verificationMethod = await ens.name(parsed.id).getText('org.w3c.did.capabilityDelegation')      
    // if (verificationMethod) {
    //   verificationMethod = filterValidVerificationMethods(verificationMethod, verificationMethods)
    //   if (didDocument && verificationMethod) {
    //     didDocument.capabilityDelegation = didDocument.capabilityDelegation?.concat(verificationMethod)
    //   }

    //   console.log('capabilitiesDelegation:' + JSON.stringify(verificationMethod))
    // }

    const contentType =
      typeof didDocument?.['@context'] !== 'undefined' ? 'application/did+ld+json' : 'application/did+json'

    if (err) {
      return {
        didDocument,
        didDocumentMetadata,
        didResolutionMetadata: {
          error: 'notFound',
          message: err,
        },
      }
    } else {
      return {
        didDocument,
        didDocumentMetadata,
        didResolutionMetadata: { contentType },
      }
    }
  }

  return { ens: resolve }
}

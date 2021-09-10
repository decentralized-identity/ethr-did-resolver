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

    const getEnsRecord = async (ens, ensname: string, name: string): Promise<any> => {
      let parsed = null
      const entry = await ens.name(ensname).getText(name)
      if (entry) {
        try {
          parsed = JSON.parse(unescape(entry))
        } catch(e) {
          return null
        }
      }
      return parsed
    }

    const filterValidVerificationMethods = (current: (string | VerificationMethod)[], all: VerificationMethod[]) : (string | VerificationMethod)[] => {
      return current.filter(e => (typeof e === 'string' || e instanceof String) && e.startsWith('#') && all?.some(b => b.id === e))
    }

    const services: ServiceEndpoint[] = await getEnsRecord(ens, parsed.id, 'org.w3c.did.service')
    if (services) {
      if (didDocument) {
        didDocument.service = didDocument.service?.concat(services)
      }
    }
    
    const verificationMethods = await getEnsRecord(ens, parsed.id, 'org.w3c.did.verificationMethod')
    if (verificationMethods) {      
      if (didDocument) {
        didDocument.service = didDocument.service?.concat(services)
      }
    }

    const relationships = ['keyAgreement', 'assertionMethod', 'authentication', 'capabilityInvocation', 'capabililtyDelegation']
    await relationships.reduce(async (memo, varient) => {
      await memo;
      try {      
        const verificationMethod: VerificationMethod[] = await getEnsRecord(ens, parsed.id, `org.w3c.did.${varient}`)
        if (verificationMethod) {
          if (didDocument) {
            didDocument[varient] = didDocument[varient]?.concat(filterValidVerificationMethods(verificationMethod, verificationMethods))
          }
        }
      } catch (e) {
        console.log('error: ' + e)
      }
    }, Promise.resolve())

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

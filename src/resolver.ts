import { EnsResolver, Provider, Web3Provider } from '@ethersproject/providers'
import {
  DIDDocument,
  DIDResolutionResult,
  DIDResolver,
  ParsedDID,
  ServiceEndpoint,
  VerificationMethod,
} from 'did-resolver'
import { ConfigurationOptions, configureResolverWithNetworks } from './configuration'
import { Errors, identifierMatcher, isDefined } from './helpers'

export function getResolver(config?: ConfigurationOptions): Record<string, DIDResolver> {
  async function resolve(did: string, parsed: ParsedDID): Promise<DIDResolutionResult> {
    const networks = configureResolverWithNetworks(config)
    // check if identifier(parsed.id) contains a network code
    const fullId = parsed.id.match(identifierMatcher)
    if (!fullId) {
      return {
        didResolutionMetadata: {
          error: Errors.invalidDid,
          message: `Not a valid did:ens: ${parsed.id}`,
        },
        didDocumentMetadata: {},
        didDocument: null,
      }
    }
    const ensName = fullId[2]
    const networkCode = typeof fullId[1] === 'string' ? fullId[1].slice(0, -1) : ''

    // get provider for that network or the mainnet provider if none other is given
    const provider: Provider = networks[networkCode]
    if (!provider || typeof provider === 'undefined') {
      return {
        didResolutionMetadata: {
          error: Errors.unknownNetwork,
          message: `This resolver is not configured for the ${networkCode} network required by ${
            parsed.id
          }. Networks: ${JSON.stringify(Object.keys(networks))}`,
        },
        didDocumentMetadata: {},
        didDocument: null,
      }
    }
    const ensResolver: EnsResolver = await (provider as Web3Provider).getResolver(ensName)
    let err: string | null = null
    let address: string | null = null
    try {
      address = await ensResolver.getAddress()
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
        service: [
          {
            id: `${did}#Web3PublicProfile-${postfix}`,
            type: 'Web3PublicProfile',
            serviceEndpoint: ensName,
          },
        ],
        verificationMethod: [
          {
            id: `${did}#${postfix}`,
            type: 'EcdsaSecp256k1RecoveryMethod2020',
            controller: did,
            blockchainAccountId,
          },
        ],
        authentication: [`${did}#${postfix}`],
        capabilityDelegation: [`${did}#${postfix}`],
        capabilityInvocation: [`${did}#${postfix}`],
        assertionMethod: [`${did}#${postfix}`],
      }
    }

    const getEnsRecord = async <T>(ensResolver: EnsResolver, name: string): Promise<T | null> => {
      let parsedEntry: T | null = null
      const entry = await ensResolver.getText(name)
      if (entry) {
        try {
          parsedEntry = JSON.parse(unescape(entry))
        } catch (e) {
          return null
        }
      }
      return parsedEntry
    }

    const filterValidVerificationMethods = (
      did: string,
      current: (string | VerificationMethod)[],
      all: VerificationMethod[]
    ): (string | VerificationMethod)[] => {
      const methodLinks = (current.filter((entry) => typeof entry === 'string') as string[])
        .map((entry) => (entry.startsWith('#') ? `${did}${entry}` : entry))
        .filter((entry) => all?.some((b) => b.id === entry))

      const fullMethods = (
        current.filter(
          (entry) =>
            entry != null &&
            typeof entry === 'object' &&
            Object.keys(entry).includes('id') &&
            Object.keys(entry).includes('type') &&
            Object.keys(entry).some((k) => k.startsWith('publicKey'))
        ) as VerificationMethod[]
      ).map((entry: VerificationMethod) => {
        entry.controller = entry.controller || did
        if (entry.id.startsWith('#')) {
          entry.id = `${did}${entry}`
        }
        return entry
      })
      return [...methodLinks, ...fullMethods]
    }

    const services = (await getEnsRecord<ServiceEndpoint[]>(ensResolver, 'org.w3c.did.service')) || []
    if (services) {
      if (didDocument) {
        didDocument.service = [...(didDocument.service || []), ...services].filter(isDefined)
      }
    }

    const verificationMethods =
      (await getEnsRecord<VerificationMethod[]>(ensResolver, 'org.w3c.did.verificationMethod')) || []

    if (verificationMethods) {
      verificationMethods.map((method) => {
        if (method.id.startsWith('#')) {
          method.id = `${did}${method.id}`
        }
        method.controller = method.controller || did
        return method
      })
      if (didDocument) {
        didDocument.verificationMethod = [...(didDocument.verificationMethod || []), ...verificationMethods].filter(
          isDefined
        )
      }
    }

    const relationships = [
      'keyAgreement',
      'assertionMethod',
      'authentication',
      'capabilityInvocation',
      'capabilityDelegation',
    ]
    await relationships.reduce(async (memo, relationship) => {
      await memo
      try {
        const verificationMethod =
          (await getEnsRecord<(string | VerificationMethod)[]>(ensResolver, `org.w3c.did.${relationship}`)) || []
        if (verificationMethod) {
          if (didDocument) {
            didDocument[relationship] = [
              ...(didDocument[relationship] || []),
              ...filterValidVerificationMethods(did, verificationMethod, verificationMethods),
            ]
          }
        }
      } catch (e) {
        // nop
      }
    }, Promise.resolve())

    const contentType =
      typeof didDocument?.['@context'] !== 'undefined' ? 'application/did+ld+json' : 'application/did+json'

    if (err) {
      return {
        didDocument,
        didDocumentMetadata,
        didResolutionMetadata: {
          error: Errors.notFound,
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

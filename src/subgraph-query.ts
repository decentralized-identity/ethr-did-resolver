import { SubgraphNetworkError, SubgraphIndexingError } from './helpers.js'

export interface RawDIDEvent {
  id: string
  identity: string
  eventType: 'DIDOwnerChanged' | 'DIDDelegateChanged' | 'DIDAttributeChanged'
  blockNumber: string
  blockTimestamp: string
  logIndex: string
  transactionHash: string
  previousChange: string
  owner: string | null
  delegateType: string | null
  delegate: string | null
  name: string | null
  value: string | null
  validTo: string | null
}

export interface QueryResult {
  events: RawDIDEvent[]
  indexedBlock: number
  hasIndexingErrors: boolean
}

const QUERY = `
query($identity: Bytes!, $lastId: Bytes!) {
  didevents(
    where: { identity: $identity, id_gt: $lastId }
    orderBy: id
    orderDirection: asc
    first: 1000
  ) {
    id
    identity
    eventType
    blockNumber
    blockTimestamp
    logIndex
    transactionHash
    previousChange
    owner
    delegateType
    delegate
    name
    value
    validTo
  }
  _meta {
    block { number }
    hasIndexingErrors
  }
}
`

export async function fetchDIDEvents(identity: string, endpoint: string, chainId: number): Promise<QueryResult> {
  const allEvents: RawDIDEvent[] = []
  let lastId = '0x'
  let indexedBlock = 0
  let hasIndexingErrors = false

  while (true) {
    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: QUERY, variables: { identity, lastId } }),
      })
    } catch (cause) {
      throw new SubgraphNetworkError(chainId, endpoint, cause)
    }

    if (!response.ok) {
      throw new SubgraphNetworkError(chainId, endpoint, new Error(`HTTP ${response.status}`))
    }

    const json = (await response.json()) as {
      data: {
        didevents: RawDIDEvent[]
        _meta: { block: { number: number }; hasIndexingErrors: boolean }
      }
    }

    const page = json.data.didevents
    indexedBlock = json.data._meta.block.number
    hasIndexingErrors = json.data._meta.hasIndexingErrors

    allEvents.push(...page)

    if (page.length < 1000) break
    lastId = page[page.length - 1].id
  }

  if (hasIndexingErrors) {
    throw new SubgraphIndexingError(chainId, endpoint, indexedBlock)
  }

  return { events: allEvents, indexedBlock, hasIndexingErrors }
}

import { interpretIdentifier, bytes32toString, CanonicalDIDEvent } from './helpers.js'

export interface SubgraphNetworkConfig {
  chainId: number
  subgraphUrl: string
  registryAddress: string
}

function rawToCanonical(raw: RawDIDEvent, chainId: number, registryAddress: string): CanonicalDIDEvent | null {
  const base = {
    chainId,
    registryAddress: registryAddress.toLowerCase(),
    identity: raw.identity.toLowerCase(), // subgraph stores as Bytes hex
    blockNumber: Number(raw.blockNumber),
    blockTimestamp: Number(raw.blockTimestamp),
    logIndex: Number(raw.logIndex),
    transactionHash: raw.transactionHash,
    previousChange: Number(raw.previousChange),
  }

  switch (raw.eventType) {
    case 'DIDOwnerChanged':
      return { ...base, eventType: 'DIDOwnerChanged', owner: raw.owner!.toLowerCase() }

    case 'DIDDelegateChanged': {
      const delegateType = bytes32toString(raw.delegateType!) // hex bytes32 → UTF-8
      if (delegateType === null) return null
      return {
        ...base,
        eventType: 'DIDDelegateChanged',
        delegateType,
        delegate: raw.delegate!.toLowerCase(),
        validTo: Number(raw.validTo!),
      }
    }

    case 'DIDAttributeChanged': {
      const name = bytes32toString(raw.name!) // hex bytes32 → UTF-8
      if (name === null) return null
      return {
        ...base,
        eventType: 'DIDAttributeChanged',
        name,
        value: raw.value!,
        validTo: Number(raw.validTo!),
      }
    }
  }
}

export async function subgraphChangeLog(
  identity: string,
  network: SubgraphNetworkConfig
): Promise<{ address: string; history: CanonicalDIDEvent[]; controllerKey?: string; chainId: number }> {
  const { address, publicKey } = interpretIdentifier(identity)
  const controllerKey = publicKey

  const queryResult = await fetchDIDEvents(address.toLowerCase(), network.subgraphUrl, network.chainId)

  const history: CanonicalDIDEvent[] = queryResult.events
    .map((raw) => rawToCanonical(raw, network.chainId, network.registryAddress))
    .filter((e): e is CanonicalDIDEvent => e !== null)
    .sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)

  return { address, history, controllerKey, chainId: network.chainId }
}

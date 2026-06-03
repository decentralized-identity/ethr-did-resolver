import { Contract, Log, LogDescription } from 'ethers'
import { bytes32toString, CanonicalDIDEvent, clampToSafeInt } from './helpers.js'

function extractPreviousChange(logResult: LogDescription): number {
  const val = logResult.args['previousChange']
  return val !== undefined ? clampToSafeInt(BigInt(val)) : 0
}

function toCanonicalEvent(
  logResult: LogDescription,
  log: Log,
  blockTimestamp: number,
  chainId: number,
  registryAddress: string
): CanonicalDIDEvent | null {
  const base = {
    chainId,
    registryAddress: registryAddress.toLowerCase(),
    identity: (logResult.args['identity'] as string).toLowerCase(),
    blockNumber: log.blockNumber,
    blockTimestamp,
    logIndex: log.index,
    transactionHash: log.transactionHash,
    previousChange: clampToSafeInt(BigInt(logResult.args['previousChange'])),
  }

  switch (logResult.name) {
    case 'DIDOwnerChanged': {
      return {
        ...base,
        eventType: 'DIDOwnerChanged',
        owner: (logResult.args['owner'] as string).toLowerCase(),
      }
    }
    case 'DIDDelegateChanged': {
      const delegateType = bytes32toString(logResult.args['delegateType'] as string)
      if (delegateType === null) return null
      return {
        ...base,
        eventType: 'DIDDelegateChanged',
        delegateType,
        delegate: (logResult.args['delegate'] as string).toLowerCase(),
        validTo: clampToSafeInt(BigInt(logResult.args['validTo'])),
      }
    }
    case 'DIDAttributeChanged': {
      const name = bytes32toString(logResult.args['name'] as string)
      if (name === null) return null
      return {
        ...base,
        eventType: 'DIDAttributeChanged',
        name,
        value: logResult.args['value'] as string,
        validTo: clampToSafeInt(BigInt(logResult.args['validTo'])),
      }
    }
    default:
      return null
  }
}

export interface DecodedLogs {
  events: CanonicalDIDEvent[]
  previousChange: number
}

/**
 * Decodes raw logs in a single pass, returning both:
 * - `events`: valid DID events as CanonicalDIDEvent objects, sorted by logIndex ASC
 *   (non-DID events like non-UTF-8 bytes32 are filtered out)
 * - `previousChange`: the earliest valid previousChange pointer found across ALL logs
 *   (including filtered ones), so chain-walking is independent of event filtering
 */
export function logDecoder(
  contract: Contract,
  logs: Log[],
  blockNumber: number,
  blockTimestamp: number,
  chainId: number,
  registryAddress: string
): DecodedLogs {
  let previousChange = 0
  const events: CanonicalDIDEvent[] = []
  for (const log of logs) {
    const parsed = contract.interface.parseLog({ topics: [...log.topics], data: log.data })
    if (!parsed) continue
    const pc = extractPreviousChange(parsed)
    if (pc > 0 && pc < blockNumber && (previousChange === 0 || pc < previousChange)) {
      previousChange = pc
    }
    const event = toCanonicalEvent(parsed, log, blockTimestamp, chainId, registryAddress)
    if (event) events.push(event)
  }
  events.sort((a, b) => a.logIndex - b.logIndex)
  return { events, previousChange }
}

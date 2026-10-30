import { Contract, LogDescription, LogParams } from 'ethers'
import { bytes32toString, CanonicalDIDEvent, clampToSafeInt } from './helpers.js'

function extractPreviousChange(logResult: LogDescription): number {
  const val = logResult.args['previousChange']
  return val !== undefined ? clampToSafeInt(BigInt(val)) : 0
}

function toCanonicalEvent(
  logResult: LogDescription,
  log: LogParams,
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
 * - `events`: valid DID events as CanonicalDIDEvent objects, sorted by
 *   (blockNumber, logIndex) ASC (non-DID events like non-UTF-8 bytes32 are
 *   filtered out)
 * - `previousChange`: the earliest valid previousChange pointer found across ALL logs
 *   (including filtered ones), so chain-walking is independent of event filtering
 *
 * @param pointerBound - exclusive upper bound for collected `previousChange`
 *   pointers. Defaults to `blockNumber`, which is correct when every log comes
 *   from that single block. When the logs span several blocks (e.g. the
 *   Arbitrum L1-pointer bucket fallback), pass the pointer the bucket was
 *   resolved from instead: an L1 estimate is far below any local block height,
 *   so using a local height as the bound would wrongly accept the bucket's own
 *   pointer as its predecessor and make the history walk loop forever.
 */
export function logDecoder(
  contract: Contract,
  logs: LogParams[],
  blockNumber: number,
  blockTimestamp: number,
  chainId: number,
  registryAddress: string,
  pointerBound: number = blockNumber
): DecodedLogs {
  let previousChange = 0
  const events: CanonicalDIDEvent[] = []
  for (const log of logs) {
    const parsed = contract.interface.parseLog({ topics: [...log.topics], data: log.data })
    if (!parsed) continue
    const pc = extractPreviousChange(parsed)
    if (pc > 0 && pc < pointerBound && (previousChange === 0 || pc < previousChange)) {
      previousChange = pc
    }
    const event = toCanonicalEvent(parsed, log, blockTimestamp, chainId, registryAddress)
    if (event) events.push(event)
  }
  events.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)
  return { events, previousChange }
}

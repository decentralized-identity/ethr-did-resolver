import { Contract, Log, LogDescription } from 'ethers'
import { bytes32toString, ERC1056Event } from './helpers.js'

function extractPreviousChange(logResult: LogDescription): bigint {
  const pcIndex = logResult.fragment.inputs.findIndex((i) => i.name === 'previousChange')
  return pcIndex >= 0 ? BigInt(logResult.args[pcIndex]) : 0n
}

function populateEventMetaClass(logResult: LogDescription, blockNumber: number): ERC1056Event | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, any> = {}
  if (logResult.fragment.inputs.length !== logResult.args.length) {
    throw new TypeError('malformed event input. wrong number of arguments')
  }
  for (let index = 0; index < logResult.fragment.inputs.length; index++) {
    const input = logResult.fragment.inputs[index]
    let val = logResult.args[index]
    if (typeof val === 'object') {
      val = BigInt(val)
    }
    if (input.type === 'bytes32') {
      val = bytes32toString(val)
      if (val === null) {
        // bytes32 field is not valid UTF-8 — this is not a DID-spec event, skip it
        return null
      }
    }
    result[input.name] = val
  }
  result._eventName = logResult.name
  result.blockNumber = blockNumber
  return result as ERC1056Event
}

export interface DecodedLogs {
  events: ERC1056Event[]
  previousChange: bigint
}

/**
 * Decodes raw logs in a single pass, returning both:
 * - `events`: valid DID events (non-DID events like non-UTF-8 bytes32 are filtered out)
 * - `previousChange`: the earliest previousChange pointer found across ALL logs
 *   (including filtered ones), so chain-walking is independent of event filtering
 */
export function logDecoder(contract: Contract, logs: Log[], blockNumber: bigint): DecodedLogs {
  let previousChange = 0n
  const events: ERC1056Event[] = []
  for (const log of logs) {
    const parsed = contract.interface.parseLog({ topics: [...log.topics], data: log.data })
    if (!parsed) continue
    const pc = extractPreviousChange(parsed)
    if (pc > 0n && pc < blockNumber && (previousChange === 0n || pc < previousChange)) {
      previousChange = pc
    }
    const event = populateEventMetaClass(parsed, log.blockNumber)
    if (event) events.push(event)
  }
  return { events, previousChange }
}

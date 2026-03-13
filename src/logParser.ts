import { Contract, Log, LogDescription } from 'ethers'
import { bytes32toString, ERC1056Event, isDefined } from './helpers.js'

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

export function logDecoder(contract: Contract, logs: Log[]): ERC1056Event[] {
  return logs
    .map((log: Log) => {
      const res = contract.interface.parseLog({ topics: [...log.topics], data: log.data })
      if (!res) return null
      return populateEventMetaClass(res, log.blockNumber)
    })
    .filter(isDefined)
}

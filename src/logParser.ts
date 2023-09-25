import { Log, LogDescription, Contract } from 'ethers'
import { bytes32toString, ERC1056Event } from './helpers'

function populateEventMetaClass(logResult: LogDescription, blockNumber: number): ERC1056Event {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, any> = {}
  if (logResult.fragment.inputs.length !== logResult.args.length) {
    throw new TypeError('malformed event input. wrong number of arguments')
  }
  logResult.fragment.inputs.forEach((input, index) => {
    let val = logResult.args[index]
    if (typeof val === 'object') {
      val = BigInt(val)
    }
    if (input.type === 'bytes32') {
      val = bytes32toString(val)
    }
    result[input.name] = val
  })
  result._eventName = logResult.name
  result.blockNumber = blockNumber
  return result as ERC1056Event
}

export function logDecoder(contract: Contract, logs: Log[]): ERC1056Event[] {
  const results: (ERC1056Event | undefined)[] = logs.map((log: Log) => {
    const res = contract.interface.parseLog({ topics: [...log.topics], data: log.data })
    if (!res) return
    const event = populateEventMetaClass(res, log.blockNumber)
    return event
  })
  const cleanResults: (ERC1056Event | undefined)[] = results.filter((result) => result !== undefined)
  // THIS IS THE GIGA HACK JUST TO REMOVE THE POSSIBLE UNDEFINED FROM THE ARRAY
  // THAT IS INTRODUCED BY THE .MAP ABOVE
  type cleanResult = Exclude<typeof results[0], undefined>
  return cleanResults as Array<cleanResult>
}

import { BigNumber } from '@ethersproject/bignumber'
import { Contract } from '@ethersproject/contracts'
import { Log } from '@ethersproject/providers'
import { LogDescription } from '@ethersproject/abi'
import { bytes32toString, DIDAttributeChanged, DIDDelegateChanged, DIDOwnerChanged, ERC1056Event } from './utils'

function populateEventMetaClass(logResult: LogDescription): ERC1056Event {
  const result: Record<string, any> = {}
  if (logResult.eventFragment.inputs.length !== logResult.args.length) {
    throw new TypeError('malformed event input. wrong number of arguments')
  }
  logResult.eventFragment.inputs.forEach((input, index) => {
    let val = logResult.args[index]
    if (typeof val === 'object') {
      val = BigNumber.from(val)
    }
    if (input.type === 'bytes32') {
      val = bytes32toString(val)
    }
    result[input.name] = val
  })
  result._eventName = logResult.name
  switch (result._eventName) {
    case 'DIDOwnerChanged':
      return result as DIDOwnerChanged
    case 'DIDDelegateChanged':
      return result as DIDDelegateChanged
    case 'DIDAttributeChanged':
      return result as DIDAttributeChanged
    default:
      return result as ERC1056Event
  }
}

export function logDecoder(contract: Contract, logs: Log[]): ERC1056Event[] {
  // console.log('logDecoder called with:', logs)
  const results = logs.map((log: Log) => {
    const res = contract.interface.parseLog(log)
    const event = populateEventMetaClass(res)
    // console.log(`decoding log ${JSON.stringify(log)} got ${JSON.stringify(event)} from ${JSON.stringify(res)}`)
    return event
  })
  return results as any
}

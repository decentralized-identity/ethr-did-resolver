import { Resolvable, Resolver } from 'did-resolver'
import { getResolver } from '../resolver'
jest.setTimeout(30000)

describe('ensResolver', () => {
  let didResolver: Resolvable

  beforeAll(async () => {
    didResolver = new Resolver(getResolver())    
  })

  it('works', async () => {    
    const did = 'did:ens:oliver-rop.eth'
    const didDoc = await didResolver.resolve(did)
    console.log(JSON.stringify(didDoc))
  })
})
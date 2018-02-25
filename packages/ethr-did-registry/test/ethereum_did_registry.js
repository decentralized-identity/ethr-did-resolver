var EthereumDIDRegistry = artifacts.require("./EthereumDIDRegistry.sol");

contract('EthereumDIDRegistry', function(accounts) {
  let didReg
  const identity = accounts[0]
  const identity2 = accounts[1]
  const delegate = accounts[2]
  const delegate2 = accounts[3]
  const badboy = accounts[4]
  // console.log({identity,identity2, delegate, delegate2, badboy})
  before(async () => {
    didReg = await EthereumDIDRegistry.deployed()
  })

  describe('identityOwner()', () => {
    describe('default owner', () => {
      it('should return the identity address itself', async () => {
        const owner = await didReg.identityOwner(identity2)
        assert.equal(owner, identity2)
      })
    })

    describe('changed owner', () => {
      before(async () => {
        await didReg.changeOwner(identity2, delegate, {from: identity2})
      })
      it('should return the delegate address', async () => {
        const owner = await didReg.identityOwner(identity2)
        assert.equal(owner, delegate)
      })
    })
  })

  describe('changeOwner()', () => {
    describe('using msg.sender', () => {
      describe('as current owner', () => {
        let tx
        before(async () => {
          tx = await didReg.changeOwner(identity, delegate, {from: identity})
        })
        it('should change owner mapping', async () => {
          const owner = await didReg.owners(identity)
          assert.equal(owner, delegate)
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(identity)
          assert.equal(latest, tx.receipt.blockNumber)
        })
        it('should create DIDKeyChanged event', () => {
          const event = tx.logs[0]
          assert.equal(event.event, 'DIDKeyChanged')
          assert.equal(event.args.identity, identity)
          assert.equal(event.args.keyType, 'owner')
          assert.equal(event.args.delegate, delegate)
          assert.equal(event.args.validTo, 0)
          assert.equal(event.args.previousChange.toNumber(), 0)
        })
      })

      describe('as new owner', () => {
        let tx
        let previousChange
        before(async () => {
          previousChange = await didReg.changed(identity)
          tx = await didReg.changeOwner(identity, delegate2, {from: delegate})
        })
        it('should change owner mapping', async () => {
          const owner = await didReg.owners(identity)
          assert.equal(owner, delegate2)
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(identity)
          assert.equal(latest, tx.receipt.blockNumber)
        })
        it('should create DIDKeyChanged event', () => {
          const event = tx.logs[0]
          assert.equal(event.event, 'DIDKeyChanged')
          assert.equal(event.args.identity, identity)
          assert.equal(event.args.keyType, 'owner')
          assert.equal(event.args.delegate, delegate2)
          assert.equal(event.args.validTo, 0)
          assert.equal(event.args.previousChange.toNumber(), previousChange.toNumber())
        })
      })

      describe('as original owner', () => {
        it('should fail', async () => {
          try {
            const tx = await didReg.changeOwner(identity, identity, {from: identity})
            assert.equal(tx, undefined, 'this should not happen')
          } catch (error) {
            assert.equal(error.message, 'VM Exception while processing transaction: revert')
          }
        })
      })

      describe('as attacker', () => {
        it('should fail', async () => {
          try {
            const owner = await didReg.identityOwner(identity)
            assert.notEqual(owner, badboy)
            const tx = await didReg.changeOwner(identity, badboy, {from: badboy})
            assert.equal(tx, undefined, 'this should not happen')
          } catch (error) {
            assert.equal(error.message, 'VM Exception while processing transaction: revert')
          }
        })
      })
    })
  })

});

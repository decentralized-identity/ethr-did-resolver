var ethutil =  require('ethereumjs-util')
var sha3 =  require('js-sha3').keccak_256
var EthereumDIDRegistry = artifacts.require("./EthereumDIDRegistry.sol");
var BN = require('bn.js')


contract('EthereumDIDRegistry', function(accounts) {
  let didReg
  const identity = accounts[0]
  let owner
  let previousChange
  const identity2 = accounts[1]
  const delegate = accounts[2]
  const delegate2 = accounts[3]
  const delegate3 = accounts[4]
  const delegate4 = accounts[5]
  const badboy = accounts[9]

  const privateKey = Buffer.from('a285ab66393c5fdda46d6fbad9e27fafd438254ab72ad5acb681a0e9f20f5d7b', 'hex')
  const signerAddress = '0x2036c6cd85692f0fb2c26e6c6b2eced9e4478dfd'

  const privateKey2 = Buffer.from('a285ab66393c5fdda46d6fbad9e27fafd438254ab72ad5acb681a0e9f20f5d7a', 'hex')
  const signerAddress2 = '0xea91e58e9fa466786726f0a947e8583c7c5b3185'

  // console.log({identity,identity2, delegate, delegate2, badboy})
  before(async () => {
    didReg = await EthereumDIDRegistry.deployed()
  })
  function getBlock (blockNumber) {
    return new Promise((resolve, reject) => {
      web3.eth.getBlock(blockNumber, (error, block) => {
        if (error) return reject(error)
        resolve(block)
      })
    })
  }

  function getLogs (filter) {
    return new Promise((resolve, reject) => {
      filter.get((error, events) => {
        if (error) return reject(error)
        resolve(events)
      })
    })
  }

  function stripHexPrefix (str) {
    if (str.startsWith('0x')) {
      return str.slice(2)
    }
    return str
  }

  function bytes32ToString (bytes) {
    return Buffer.from(bytes.slice(2).split('00')[0], 'hex').toString()
  }

  function stringToBytes32 (str) {
    const buffstr = Buffer.from(str).toString('hex')
    return buffstr + '0'.repeat(64 - buffstr.length)
  }

  function leftPad (data, size = 64) {
    if (data.length === size) return data
    return '0'.repeat(size - data.length) + data
  }

  async function signData (identity, signer, key, data) {
    const nonce = await didReg.nonce(signer)
    const paddedNonce = leftPad(Buffer.from([nonce], 64).toString('hex'))
    const dataToSign = '1900' + stripHexPrefix(didReg.address) + paddedNonce + stripHexPrefix(identity) + data
    const hash = Buffer.from(sha3.buffer(Buffer.from(dataToSign, 'hex')))
    const signature = ethutil.ecsign(hash, key)
    const publicKey = ethutil.ecrecover(
      hash,
      signature.v,
      signature.r,
      signature.s
    )
    return {
      r: '0x'+signature.r.toString('hex'),
      s: '0x'+signature.s.toString('hex'),
      v: signature.v
    }
  }

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
          owner = await didReg.owners(identity)
          assert.equal(owner, delegate)
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(identity)
          assert.equal(latest, tx.receipt.blockNumber)
        })
        it('should create DIDDelegateChanged event', () => {
          const event = tx.logs[0]
          assert.equal(event.event, 'DIDOwnerChanged')
          assert.equal(event.args.identity, identity)
          assert.equal(event.args.owner, delegate)
          assert.equal(event.args.previousChange.toNumber(), 0)
        })
      })

      describe('as new owner', () => {
        let tx
        before(async () => {
          previousChange = await didReg.changed(identity)
          tx = await didReg.changeOwner(identity, delegate2, {from: delegate})
        })
        it('should change owner mapping', async () => {
          owner = await didReg.owners(identity)
          assert.equal(owner, delegate2)
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(identity)
          assert.equal(latest, tx.receipt.blockNumber)
        })
        it('should create DIDOwnerChanged event', () => {
          const event = tx.logs[0]
          assert.equal(event.event, 'DIDOwnerChanged')
          assert.equal(event.args.identity, identity)
          assert.equal(event.args.owner, delegate2)
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
            const tx = await didReg.changeOwner(identity, badboy, {from: badboy})
            assert.equal(tx, undefined, 'this should not happen')
          } catch (error) {
            assert.equal(error.message, 'VM Exception while processing transaction: revert')
          }
        })
      })
    })
    describe('using signature', () => {
      describe('as current owner', () => {
        let tx
        before(async () => {
          const sig = await signData(signerAddress, signerAddress, privateKey, Buffer.from('changeOwner').toString('hex') + stripHexPrefix(signerAddress2))
          tx = await didReg.changeOwnerSigned(signerAddress, sig.v, sig.r, sig.s, signerAddress2, {from: badboy})
        })
        it('should change owner mapping', async () => {
          const owner2 = await didReg.owners(signerAddress)
          assert.equal(owner2, signerAddress2)
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(signerAddress)
          assert.equal(latest, tx.receipt.blockNumber)
        })
        it('should create DIDOwnerChanged event', () => {
          const event = tx.logs[0]
          // console.log(event.args)
          assert.equal(event.event, 'DIDOwnerChanged')
          assert.equal(event.args.identity, signerAddress)
          assert.equal(event.args.owner, signerAddress2)
          assert.equal(event.args.previousChange.toNumber(), 0)
        })
      })
    })
  })

  describe('addDelegate()', () => {
    describe('using msg.sender', () => {
      it('validDelegate should be false', async () => {
        const valid = await didReg.validDelegate(identity, 'attestor', delegate3)
        assert.equal(valid, false, 'not yet assigned delegate correctly')
      })
      describe('as current owner', () => {
        let tx
        let block
        before(async () => {
          previousChange = await didReg.changed(identity)
          tx = await didReg.addDelegate(identity, 'attestor', delegate3, 86400, {from: delegate2})
          block = await getBlock(tx.receipt.blockNumber)
        })
        it('validDelegate should be true', async () => {
          const valid = await didReg.validDelegate(identity, 'attestor', delegate3)
          assert.equal(valid, true, 'assigned delegate correctly')
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(identity)
          assert.equal(latest, tx.receipt.blockNumber)
        })
        it('should create DIDDelegateChanged event', () => {
          const event = tx.logs[0]
          assert.equal(event.event, 'DIDDelegateChanged')
          assert.equal(event.args.identity, identity)
          assert.equal(bytes32ToString(event.args.delegateType), 'attestor')
          assert.equal(event.args.delegate, delegate3)
          assert.equal(event.args.validTo.toNumber(), block.timestamp + 86400)
          assert.equal(event.args.previousChange.toNumber(), previousChange.toNumber())
        })
      })

      describe('as attacker', () => {
        it('should fail', async () => {
          try {
            const tx = await didReg.addDelegate(identity, 'attestor', badboy, 86400, {from: badboy})
            assert.equal(tx, undefined, 'this should not happen')
          } catch (error) {
            assert.equal(error.message, 'VM Exception while processing transaction: revert')
          }
        })
      })
    })
    describe('using signature', () => {
      describe('as current owner', () => {
        let tx1
        let block1
        let previousChange1
        let tx2
        let block2
        let previousChange2
        before(async () => {
          previousChange1 = await didReg.changed(signerAddress)
          let sig = await signData(signerAddress, signerAddress2, privateKey2, Buffer.from('addDelegate').toString('hex') + stringToBytes32('attestor') + stripHexPrefix(delegate) + leftPad(new BN(86400).toString(16)))
          tx1 = await didReg.addDelegateSigned(signerAddress, sig.v, sig.r, sig.s, 'attestor', delegate, 86400, {from: badboy})
          block1 = await getBlock(tx1.receipt.blockNumber)
        })
        it('validDelegate should be true', async () => {
          let valid = await didReg.validDelegate(signerAddress, 'attestor', delegate)
          assert.equal(valid, true, 'assigned delegate correctly')
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(signerAddress)
          assert.equal(latest.toNumber(), tx1.receipt.blockNumber)
        })
        it('should create DIDDelegateChanged event', () => {
          let event = tx1.logs[0]
          assert.equal(event.event, 'DIDDelegateChanged')
          assert.equal(event.args.identity, signerAddress)
          assert.equal(bytes32ToString(event.args.delegateType), 'attestor')
          assert.equal(event.args.delegate, delegate)
          assert.equal(event.args.validTo.toNumber(), block1.timestamp + 86400)
          assert.equal(event.args.previousChange.toNumber(), previousChange1.toNumber())
        })
      })
    })
  })

  describe('revokeDelegate()', () => {
    describe('using msg.sender', () => {
      it('validDelegate should be true', async () => {
        const valid = await didReg.validDelegate(identity, 'attestor', delegate3)
        assert.equal(valid, true, 'not yet revoked')
      })
      describe('as current owner', () => {
        let tx
        let block
        before(async () => {
          previousChange = await didReg.changed(identity)
          tx = await didReg.revokeDelegate(identity, 'attestor', delegate3, {from: delegate2})
          block = await getBlock(tx.receipt.blockNumber)
        })
        it('validDelegate should be false', async () => {
          const valid = await didReg.validDelegate(identity, 'attestor', delegate3)
          assert.equal(valid, false, 'revoked correctly')
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(identity)
          assert.equal(latest, tx.receipt.blockNumber)
        })
        it('should create DIDDelegateChanged event', () => {
          const event = tx.logs[0]
          assert.equal(event.event, 'DIDDelegateChanged')
          assert.equal(event.args.identity, identity)
          assert.equal(bytes32ToString(event.args.delegateType), 'attestor')
          assert.equal(event.args.delegate, delegate3)
          assert.isBelow(event.args.validTo.toNumber(), Math.floor(Date.now()/1000) + 1)
          assert.equal(event.args.previousChange.toNumber(), previousChange.toNumber())
        })
      })
      describe('as attacker', () => {
        it('should fail', async () => {
          try {
            const tx = await didReg.revokeDelegate(identity, 'attestor', badboy, {from: badboy})
            assert.equal(tx, undefined, 'this should not happen')
          } catch (error) {
            assert.equal(error.message, 'VM Exception while processing transaction: revert')
          }
        })
      })
    })
    describe('using signature', () => {
      describe('as current owner', () => {
        let tx
        before(async () => {
          previousChange = await didReg.changed(signerAddress)
          const sig = await signData(signerAddress, signerAddress2, privateKey2, Buffer.from('revokeDelegate').toString('hex') + stringToBytes32('attestor') + stripHexPrefix(delegate))
          tx = await didReg.revokeDelegateSigned(signerAddress, sig.v, sig.r, sig.s, 'attestor', delegate, {from: badboy})
          block = await getBlock(tx.receipt.blockNumber)
        })
        it('validDelegate should be false', async () => {
          const valid = await didReg.validDelegate(signerAddress, 'attestor', delegate)
          assert.equal(valid, false, 'revoked delegate correctly')
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(signerAddress)
          assert.equal(latest, tx.receipt.blockNumber)
        })
        it('should create DIDDelegateChanged event', () => {
          const event = tx.logs[0]
          assert.equal(event.event, 'DIDDelegateChanged')
          assert.equal(event.args.identity, signerAddress)
          assert.equal(bytes32ToString(event.args.delegateType), 'attestor')
          assert.equal(event.args.delegate, delegate)
          assert.isBelow(event.args.validTo.toNumber(), Math.floor(Date.now()/1000) + 1)
          assert.equal(event.args.previousChange.toNumber(), previousChange.toNumber())
        })
      })
    })
  })

  describe('setAttribute()', () => {
    describe('using msg.sender', () => {
      describe('as current owner', () => {
        let tx
        let block
        before(async () => {
          previousChange = await didReg.changed(identity)
          tx = await didReg.setAttribute(identity, 'encryptionKey', 'mykey', 86400, {from: owner})
          block = await getBlock(tx.receipt.blockNumber)
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(identity)
          assert.equal(latest, tx.receipt.blockNumber)
        })
        it('should create DIDAttributeChanged event', () => {
          const event = tx.logs[0]
          assert.equal(event.event, 'DIDAttributeChanged')
          assert.equal(event.args.identity, identity)
          assert.equal(bytes32ToString(event.args.name), 'encryptionKey')
          assert.equal(event.args.value, '0x6d796b6579')
          assert.equal(event.args.validTo.toNumber(), block.timestamp + 86400)
          assert.equal(event.args.previousChange.toNumber(), previousChange.toNumber())
        })
      })

      describe('as attacker', () => {
        it('should fail', async () => {
          try {
            const tx = await didReg.setAttribute(identity, 'encryptionKey', 'mykey', 86400, {from: badboy})
            assert.equal(tx, undefined, 'this should not happen')
          } catch (error) {
            assert.equal(error.message, 'VM Exception while processing transaction: revert')
          }
        })
      })
    })

    describe('using signature', () => {
      describe('as current owner', () => {
        let tx
        before(async () => {
          previousChange = await didReg.changed(signerAddress)
          const sig = await signData(signerAddress, signerAddress, privateKey2, Buffer.from("setAttribute").toString('hex') + stringToBytes32("encryptionKey") + Buffer.from('mykey').toString('hex') + leftPad(new BN(86400).toString(16)))
          tx = await didReg.setAttributeSigned(signerAddress, sig.v, sig.r, sig.s, 'encryptionKey', 'mykey', 86400, {from: badboy})
          block = await getBlock(tx.receipt.blockNumber)
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(signerAddress)
          assert.equal(latest, tx.receipt.blockNumber)
        })
        it('should create DIDDelegateChanged event', () => {
          const event = tx.logs[0]
          assert.equal(event.event, 'DIDAttributeChanged')
          assert.equal(event.args.identity, signerAddress)
          assert.equal(bytes32ToString(event.args.name), 'encryptionKey')
          assert.equal(event.args.value, '0x6d796b6579')
          assert.equal(event.args.validTo.toNumber(), block.timestamp + 86400)
          assert.equal(event.args.previousChange.toNumber(), previousChange.toNumber())
        })
      })
    })
  })

  describe('revokeAttribute()', () => {
    describe('using msg.sender', () => {
      describe('as current owner', () => {
        let tx
        let block
        before(async () => {
          previousChange = await didReg.changed(identity)
          tx = await didReg.revokeAttribute(identity, 'encryptionKey', 'mykey', {from: owner})
          block = await getBlock(tx.receipt.blockNumber)
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(identity)
          assert.equal(latest, tx.receipt.blockNumber)
        })
        it('should create DIDAttributeChanged event', () => {
          const event = tx.logs[0]
          assert.equal(event.event, 'DIDAttributeChanged')
          assert.equal(event.args.identity, identity)
          assert.equal(bytes32ToString(event.args.name), 'encryptionKey')
          assert.equal(event.args.value, '0x6d796b6579')
          assert.equal(event.args.validTo.toNumber(), 0)
          assert.equal(event.args.previousChange.toNumber(), previousChange.toNumber())
        })
      })

      describe('as attacker', () => {
        it('should fail', async () => {
          try {
            const tx = await didReg.revokeAttribute(identity, 'encryptionKey', 'mykey', {from: badboy})
            assert.equal(tx, undefined, 'this should not happen')
          } catch (error) {
            assert.equal(error.message, 'VM Exception while processing transaction: revert')
          }
        })
      })
    })

    describe('using signature', () => {
      describe('as current owner', () => {
        let tx
        before(async () => {
          previousChange = await didReg.changed(signerAddress)
          const sig = await signData(signerAddress, signerAddress, privateKey2, Buffer.from('revokeAttribute').toString('hex') + stringToBytes32('encryptionKey') + Buffer.from('mykey').toString('hex'))
          tx = await didReg.revokeAttributeSigned(signerAddress, sig.v, sig.r, sig.s, 'encryptionKey', 'mykey', {from: badboy})
          block = await getBlock(tx.receipt.blockNumber)
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(signerAddress)
          assert.equal(latest, tx.receipt.blockNumber)
        })
        it('should create DIDDelegateChanged event', () => {
          const event = tx.logs[0]
          assert.equal(event.event, 'DIDAttributeChanged')
          assert.equal(event.args.identity, signerAddress)
          assert.equal(bytes32ToString(event.args.name), 'encryptionKey')
          assert.equal(event.args.value, '0x6d796b6579')
          assert.equal(event.args.validTo.toNumber(), 0)
          assert.equal(event.args.previousChange.toNumber(), previousChange.toNumber())
        })
      })
    })
  })


  describe('Events', () => {
    it('can create list', async () => {
      const history = []
      previousChange = await didReg.changed(identity)
      while (previousChange) {
        const filter = await didReg.allEvents({topics: [identity], fromBlock: previousChange, toBlock: previousChange})
        const events = await getLogs(filter)
        previousChange = undefined
        for (let event of events) {
          history.unshift(event.event)
          previousChange = event.args.previousChange
        }
      }
      assert.deepEqual(history, [
        'DIDOwnerChanged',
        'DIDOwnerChanged',
        'DIDDelegateChanged',
        'DIDDelegateChanged',
        'DIDAttributeChanged',
        'DIDAttributeChanged'
      ])
    })
  })
})

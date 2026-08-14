import { expect } from 'chai'
import { before, describe, it } from 'mocha'
import { concat, decodeBytes32String, encodeBytes32String, getBytes, toBeHex, toUtf8Bytes, zeroPadValue } from 'ethers'
// Type augmentation for `.revertedWith` matcher
import '@nomicfoundation/hardhat-ethers-chai-matchers'
import type { Block, ContractTransactionReceipt, JsonRpcSigner, Provider } from 'ethers'
import type { EthereumDIDRegistry } from '../typechain-types/index.js'
import type { DIDAttributeChangedEvent, DIDDelegateChangedEvent } from '../typechain-types/EthereumDIDRegistry.js'
import { deployRegistry, signData } from './testUtils.js'

describe('ERC1056', () => {
  let didReg: EthereumDIDRegistry
  let didRegAddress: string
  let provider: Provider
  let signers: JsonRpcSigner[] // accounts[0..5]
  let identity: string // accounts[0]
  let delegate: string // accounts[2]
  let delegate2: string // accounts[3]
  let delegate3: string // accounts[4]
  let badBoy: string // accounts[5]

  const privateKey = getBytes('0xa285ab66393c5fdda46d6fbad9e27fafd438254ab72ad5acb681a0e9f20f5d7b')
  const signerAddress = '0x2036C6CD85692F0Fb2C26E6c6B2ECed9e4478Dfd'

  const privateKey2 = getBytes('0xa285ab66393c5fdda46d6fbad9e27fafd438254ab72ad5acb681a0e9f20f5d7a')
  const signerAddress2 = '0xEA91e58E9Fa466786726F0a947e8583c7c5B3185'

  const attestor = encodeBytes32String('attestor')
  const encryptionKey = encodeBytes32String('encryptionKey')

  before(async () => {
    const harness = await deployRegistry()
    didReg = harness.registry
    didRegAddress = harness.registryAddress
    provider = harness.provider
    signers = harness.signers
    ;[identity, , delegate, delegate2, delegate3, badBoy] = await Promise.all(
      signers.map((signer) => signer.getAddress())
    )

    // owner(identity) == delegate2 — the state the legacy sections assumed
    // after the changeOwner tests (canonical setup per issue 13).
    await (await didReg.connect(signers[0]).changeOwner(identity, delegate2)).wait()

    // owner(signerAddress) == signerAddress2 — reproduced from the legacy
    // changeOwnerSigned meta-tx that ran earlier in the legacy file.
    const sig = await signData(
      didReg,
      didRegAddress,
      signerAddress,
      signerAddress,
      privateKey,
      concat([toUtf8Bytes('changeOwner'), signerAddress2])
    )
    await (
      await didReg.connect(signers[5]).changeOwnerSigned(signerAddress, sig.v, sig.r, sig.s, signerAddress2)
    ).wait()
  })

  describe('addDelegate()', () => {
    describe('using msg.sender', () => {
      it('validDelegate should be false', async () => {
        const valid = await didReg.validDelegate(identity, attestor, delegate3)
        expect(valid).to.equal(false) // we have not yet assigned delegate correctly
      })

      describe('as current owner', () => {
        let receipt: ContractTransactionReceipt
        let block: Block
        let previousChange: number
        before(async () => {
          previousChange = Number(await didReg.changed(identity))
          const tx = await didReg.connect(signers[3]).addDelegate(identity, attestor, delegate3, 86400)
          receipt = (await tx.wait())!
          block = (await provider.getBlock(receipt.blockNumber))!
        })
        it('validDelegate should be true', async () => {
          const valid = await didReg.validDelegate(identity, attestor, delegate3)
          expect(valid).to.equal(true) // assigned delegate correctly
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(identity)
          expect(Number(latest)).to.equal(receipt.blockNumber)
        })
        it('should create DIDDelegateChanged event', async () => {
          const event = didReg.interface.parseLog(receipt.logs[0]) as unknown as DIDDelegateChangedEvent.LogDescription
          expect(event.name).to.equal('DIDDelegateChanged')
          expect(event.args.identity).to.equal(identity)
          expect(decodeBytes32String(event.args.delegateType)).to.equal('attestor')
          expect(event.args.delegate).to.equal(delegate3)
          expect(Number(event.args.validTo)).to.equal(block.timestamp + 86400)
          expect(Number(event.args.previousChange)).to.equal(previousChange)
        })
      })

      describe('as original owner', () => {
        it('should fail', async () => {
          const currentOwnerAddress = await didReg.owners(identity)
          expect(currentOwnerAddress).not.to.equal(identity)
          await expect(didReg.connect(signers[0]).addDelegate(identity, attestor, badBoy, 86400)).to.be.revertedWith(
            'bad_actor'
          )
        })
      })

      describe('as attacker', () => {
        it('should fail', async () => {
          await expect(didReg.connect(signers[5]).addDelegate(identity, attestor, badBoy, 86400)).to.be.revertedWith(
            'bad_actor'
          )
        })
      })
    })

    describe('using signature', () => {
      describe('as current owner', () => {
        let receipt: ContractTransactionReceipt
        let block: Block
        let previousChange: number
        before(async () => {
          previousChange = Number(await didReg.changed(signerAddress))
          const sig = await signData(
            didReg,
            didRegAddress,
            signerAddress,
            signerAddress2,
            privateKey2,
            concat([toUtf8Bytes('addDelegate'), attestor, delegate, zeroPadValue(toBeHex(86400), 32)])
          )
          const tx = await didReg
            .connect(signers[5])
            .addDelegateSigned(signerAddress, sig.v, sig.r, sig.s, attestor, delegate, 86400)
          receipt = (await tx.wait())!
          block = (await provider.getBlock(receipt.blockNumber))!
        })
        it('validDelegate should be true', async () => {
          const valid = await didReg.validDelegate(signerAddress, attestor, delegate)
          expect(valid).to.equal(true) // assigned delegate correctly
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(signerAddress)
          expect(Number(latest)).to.equal(receipt.blockNumber)
        })
        it('should create DIDDelegateChanged event', async () => {
          const event = didReg.interface.parseLog(receipt.logs[0]) as unknown as DIDDelegateChangedEvent.LogDescription
          expect(event.name).to.equal('DIDDelegateChanged')
          expect(event.args.identity).to.equal(signerAddress)
          expect(decodeBytes32String(event.args.delegateType)).to.equal('attestor')
          expect(event.args.delegate).to.equal(delegate)
          expect(Number(event.args.validTo)).to.equal(block.timestamp + 86400)
          expect(Number(event.args.previousChange)).to.equal(previousChange)
        })
      })

      describe('as wrong owner', () => {
        it('should fail', async () => {
          const sig = await signData(
            didReg,
            didRegAddress,
            signerAddress,
            signerAddress,
            privateKey,
            concat([toUtf8Bytes('addDelegate'), attestor, delegate, zeroPadValue(toBeHex(86400), 32)])
          )
          await expect(
            didReg.connect(signers[5]).addDelegateSigned(signerAddress, sig.v, sig.r, sig.s, attestor, delegate, 86400)
          ).to.be.revertedWith('bad_signature')
        })
      })

      describe('using wrong nonce', () => {
        it('should fail', async () => {
          const currentNonce = Number(await didReg.nonce(signerAddress2))
          expect(currentNonce).to.equal(1)
          const sig = await signData(
            didReg,
            didRegAddress,
            signerAddress,
            signerAddress2,
            privateKey2,
            concat([toUtf8Bytes('addDelegate'), attestor, delegate, zeroPadValue(toBeHex(86400), 32)]),
            2
          )
          await expect(
            didReg.connect(signers[5]).addDelegateSigned(signerAddress, sig.v, sig.r, sig.s, attestor, delegate, 86400)
          ).to.be.revertedWith('bad_signature')
        })
      })
    })
  })

  describe('revokeDelegate()', () => {
    describe('using msg.sender', () => {
      it('validDelegate should be true', async () => {
        const valid = await didReg.validDelegate(identity, attestor, delegate3)
        expect(valid).to.equal(true) // not yet revoked
      })

      describe('as current owner', () => {
        let receipt: ContractTransactionReceipt
        let previousChange: number
        before(async () => {
          previousChange = Number(await didReg.changed(identity))
          const tx = await didReg.connect(signers[3]).revokeDelegate(identity, attestor, delegate3)
          receipt = (await tx.wait())!
        })
        it('validDelegate should be false', async () => {
          const valid = await didReg.validDelegate(identity, attestor, delegate3)
          expect(valid).to.equal(false) // revoked correctly
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(identity)
          expect(Number(latest)).to.equal(receipt.blockNumber)
        })
        it('should create DIDDelegateChanged event', async () => {
          const event = didReg.interface.parseLog(receipt.logs[0]) as unknown as DIDDelegateChangedEvent.LogDescription
          expect(event.name).to.equal('DIDDelegateChanged')
          expect(event.args.identity).to.equal(identity)
          expect(decodeBytes32String(event.args.delegateType)).to.equal('attestor')
          expect(event.args.delegate).to.equal(delegate3)
          expect(Number(event.args.validTo)).to.be.lessThanOrEqual(
            (await provider.getBlock(receipt.blockNumber))!.timestamp
          )
          expect(Number(event.args.previousChange)).to.equal(previousChange)
        })
      })

      describe('as original owner', () => {
        it('should fail', async () => {
          const currentOwnerAddress = await didReg.owners(identity)
          expect(currentOwnerAddress).not.to.equal(identity)
          await expect(didReg.connect(signers[0]).revokeDelegate(identity, attestor, badBoy)).to.be.revertedWith(
            'bad_actor'
          )
        })
      })

      describe('as attacker', () => {
        it('should fail', async () => {
          await expect(didReg.connect(signers[5]).revokeDelegate(identity, attestor, badBoy)).to.be.revertedWith(
            'bad_actor'
          )
        })
      })
    })

    describe('using signature', () => {
      describe('as current owner', () => {
        let receipt: ContractTransactionReceipt
        let previousChange: number
        before(async () => {
          previousChange = Number(await didReg.changed(signerAddress))
          const sig = await signData(
            didReg,
            didRegAddress,
            signerAddress,
            signerAddress2,
            privateKey2,
            concat([toUtf8Bytes('revokeDelegate'), attestor, delegate])
          )
          const tx = await didReg
            .connect(signers[5])
            .revokeDelegateSigned(signerAddress, sig.v, sig.r, sig.s, attestor, delegate)
          receipt = (await tx.wait())!
        })
        it('validDelegate should be false', async () => {
          const valid = await didReg.validDelegate(signerAddress, attestor, delegate)
          expect(valid).to.equal(false) // revoked delegate correctly
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(signerAddress)
          expect(Number(latest)).to.equal(receipt.blockNumber)
        })
        it('should create DIDDelegateChanged event', async () => {
          const event = didReg.interface.parseLog(receipt.logs[0]) as unknown as DIDDelegateChangedEvent.LogDescription
          expect(event.name).to.equal('DIDDelegateChanged')
          expect(event.args.identity).to.equal(signerAddress)
          expect(decodeBytes32String(event.args.delegateType)).to.equal('attestor')
          expect(event.args.delegate).to.equal(delegate)
          expect(Number(event.args.validTo)).to.be.lessThanOrEqual(
            (await provider.getBlock(receipt.blockNumber))!.timestamp
          )
          expect(Number(event.args.previousChange)).to.equal(previousChange)
        })
      })

      describe('as wrong owner', () => {
        it('should fail', async () => {
          const sig = await signData(
            didReg,
            didRegAddress,
            signerAddress,
            signerAddress,
            privateKey,
            concat([toUtf8Bytes('revokeDelegate'), attestor, delegate])
          )
          await expect(
            didReg.connect(signers[5]).revokeDelegateSigned(signerAddress, sig.v, sig.r, sig.s, attestor, delegate)
          ).to.be.revertedWith('bad_signature')
        })
      })

      describe('using wrong nonce', () => {
        it('should fail', async () => {
          const currentNonce = Number(await didReg.nonce(signerAddress2))
          expect(currentNonce).to.equal(2)
          const sig = await signData(
            didReg,
            didRegAddress,
            signerAddress,
            signerAddress2,
            privateKey2,
            concat([toUtf8Bytes('revokeDelegate'), attestor, delegate]),
            1
          )
          await expect(
            didReg.connect(signers[5]).revokeDelegateSigned(signerAddress, sig.v, sig.r, sig.s, attestor, delegate)
          ).to.be.revertedWith('bad_signature')
        })
      })
    })
  })

  describe('setAttribute()', () => {
    describe('using msg.sender', () => {
      describe('as current owner', () => {
        let receipt: ContractTransactionReceipt
        let block: Block
        let previousChange: number
        before(async () => {
          previousChange = Number(await didReg.changed(identity))
          // owner(identity) == delegate2 (accounts[3]) per the file setup —
          // the legacy code looked the current-owner signer up dynamically.
          const tx = await didReg.connect(signers[3]).setAttribute(identity, encryptionKey, toUtf8Bytes('mykey'), 86400)
          receipt = (await tx.wait())!
          block = (await provider.getBlock(receipt.blockNumber))!
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(identity)
          expect(Number(latest)).to.equal(receipt.blockNumber)
        })
        it('should create DIDAttributeChanged event', async () => {
          const event = didReg.interface.parseLog(receipt.logs[0]) as unknown as DIDAttributeChangedEvent.LogDescription
          expect(event.name).to.equal('DIDAttributeChanged')
          expect(event.args.identity).to.equal(identity)
          expect(decodeBytes32String(event.args.name)).to.equal('encryptionKey')
          expect(event.args.value).to.equal('0x6d796b6579') // the hex encoding of the string "mykey"
          expect(Number(event.args.validTo)).to.equal(block.timestamp + 86400)
          expect(Number(event.args.previousChange)).to.equal(previousChange)
        })
      })

      describe('as original owner', () => {
        it('should fail', async () => {
          const currentOwnerAddress = await didReg.owners(identity)
          expect(currentOwnerAddress).not.to.equal(identity)
          await expect(
            didReg.connect(signers[0]).setAttribute(identity, encryptionKey, toUtf8Bytes('mykey'), 86400)
          ).to.be.revertedWith('bad_actor')
        })
      })

      describe('as attacker', () => {
        it('should fail', async () => {
          await expect(
            didReg.connect(signers[5]).setAttribute(identity, encryptionKey, toUtf8Bytes('mykey'), 86400)
          ).to.be.revertedWith('bad_actor')
        })
      })
    })

    describe('using signature', () => {
      describe('as current owner', () => {
        let receipt: ContractTransactionReceipt
        let block: Block
        let previousChange: number
        before(async () => {
          previousChange = Number(await didReg.changed(signerAddress))
          const sig = await signData(
            didReg,
            didRegAddress,
            signerAddress,
            signerAddress2,
            privateKey2,
            concat([toUtf8Bytes('setAttribute'), encryptionKey, toUtf8Bytes('mykey'), zeroPadValue(toBeHex(86400), 32)])
          )
          const tx = await didReg
            .connect(signers[5])
            .setAttributeSigned(signerAddress, sig.v, sig.r, sig.s, encryptionKey, toUtf8Bytes('mykey'), 86400)
          receipt = (await tx.wait())!
          block = (await provider.getBlock(receipt.blockNumber))!
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(signerAddress)
          expect(Number(latest)).to.equal(receipt.blockNumber)
        })
        it('should create DIDAttributeChanged event', async () => {
          const event = didReg.interface.parseLog(receipt.logs[0]) as unknown as DIDAttributeChangedEvent.LogDescription
          expect(event.name).to.equal('DIDAttributeChanged')
          expect(event.args.identity).to.equal(signerAddress)
          expect(decodeBytes32String(event.args.name)).to.equal('encryptionKey')
          expect(event.args.value).to.equal('0x6d796b6579') // the hex encoding of the string "mykey"
          expect(Number(event.args.validTo)).to.equal(block.timestamp + 86400)
          expect(Number(event.args.previousChange)).to.equal(previousChange)
        })
      })

      describe('as wrong owner', () => {
        it('should fail', async () => {
          const sig = await signData(
            didReg,
            didRegAddress,
            signerAddress,
            signerAddress,
            privateKey,
            concat([toUtf8Bytes('setAttribute'), encryptionKey, toUtf8Bytes('mykey'), zeroPadValue(toBeHex(86400), 32)])
          )
          await expect(
            didReg
              .connect(signers[5])
              .setAttributeSigned(signerAddress, sig.v, sig.r, sig.s, encryptionKey, toUtf8Bytes('mykey'), 86400)
          ).to.be.revertedWith('bad_signature')
        })
      })

      describe('using wrong nonce', () => {
        it('should fail', async () => {
          const currentNonce = Number(await didReg.nonce(signerAddress2))
          expect(currentNonce).to.equal(3)
          const sig = await signData(
            didReg,
            didRegAddress,
            signerAddress,
            signerAddress2,
            privateKey2,
            concat([
              toUtf8Bytes('setAttribute'),
              encryptionKey,
              toUtf8Bytes('mykey'),
              zeroPadValue(toBeHex(86400), 32),
            ]),
            1
          )
          await expect(
            didReg
              .connect(signers[5])
              .setAttributeSigned(signerAddress, sig.v, sig.r, sig.s, encryptionKey, toUtf8Bytes('mykey'), 86400)
          ).to.be.revertedWith('bad_signature')
        })
      })
    })
  })

  describe('revokeAttribute()', () => {
    describe('using msg.sender', () => {
      describe('as current owner', () => {
        let receipt: ContractTransactionReceipt
        let previousChange: number
        before(async () => {
          previousChange = Number(await didReg.changed(identity))
          const tx = await didReg.connect(signers[3]).revokeAttribute(identity, encryptionKey, toUtf8Bytes('mykey'))
          receipt = (await tx.wait())!
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(identity)
          expect(Number(latest)).to.equal(receipt.blockNumber)
        })
        it('should create DIDAttributeChanged event', async () => {
          const event = didReg.interface.parseLog(receipt.logs[0]) as unknown as DIDAttributeChangedEvent.LogDescription
          expect(event.name).to.equal('DIDAttributeChanged')
          expect(event.args.identity).to.equal(identity)
          expect(decodeBytes32String(event.args.name)).to.equal('encryptionKey')
          expect(event.args.value).to.equal('0x6d796b6579') // the hex encoding of the string "mykey"
          expect(Number(event.args.validTo)).to.equal(0)
          expect(Number(event.args.previousChange)).to.equal(previousChange)
        })
      })

      describe('as original owner', () => {
        it('should fail', async () => {
          const currentOwnerAddress = await didReg.owners(identity)
          expect(currentOwnerAddress).not.to.equal(identity)
          await expect(
            didReg.connect(signers[0]).revokeAttribute(identity, encryptionKey, toUtf8Bytes('mykey'))
          ).to.be.revertedWith('bad_actor')
        })
      })

      describe('as attacker', () => {
        it('should fail', async () => {
          await expect(
            didReg.connect(signers[5]).revokeAttribute(identity, encryptionKey, toUtf8Bytes('mykey'))
          ).to.be.revertedWith('bad_actor')
        })
      })
    })

    describe('using signature', () => {
      describe('as current owner', () => {
        let receipt: ContractTransactionReceipt
        let previousChange: number
        before(async () => {
          previousChange = Number(await didReg.changed(signerAddress))
          const sig = await signData(
            didReg,
            didRegAddress,
            signerAddress,
            signerAddress2,
            privateKey2,
            concat([toUtf8Bytes('revokeAttribute'), encryptionKey, toUtf8Bytes('mykey')])
          )
          const tx = await didReg
            .connect(signers[5])
            .revokeAttributeSigned(signerAddress, sig.v, sig.r, sig.s, encryptionKey, toUtf8Bytes('mykey'))
          receipt = (await tx.wait())!
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(signerAddress)
          expect(Number(latest)).to.equal(receipt.blockNumber)
        })
        it('should create DIDAttributeChanged event', async () => {
          const event = didReg.interface.parseLog(receipt.logs[0]) as unknown as DIDAttributeChangedEvent.LogDescription
          expect(event.name).to.equal('DIDAttributeChanged')
          expect(event.args.identity).to.equal(signerAddress)
          expect(decodeBytes32String(event.args.name)).to.equal('encryptionKey')
          expect(event.args.value).to.equal('0x6d796b6579') // the hex encoding of the string "mykey"
          expect(Number(event.args.validTo)).to.equal(0)
          expect(Number(event.args.previousChange)).to.equal(previousChange)
        })
      })

      describe('as wrong owner', () => {
        it('should fail', async () => {
          const sig = await signData(
            didReg,
            didRegAddress,
            signerAddress,
            signerAddress,
            privateKey,
            concat([toUtf8Bytes('revokeAttribute'), encryptionKey, toUtf8Bytes('mykey')])
          )
          await expect(
            didReg
              .connect(signers[5])
              .revokeAttributeSigned(signerAddress, sig.v, sig.r, sig.s, encryptionKey, toUtf8Bytes('mykey'))
          ).to.be.revertedWith('bad_signature')
        })
      })

      describe('using wrong nonce', () => {
        it('should fail', async () => {
          const currentNonce = Number(await didReg.nonce(signerAddress2))
          expect(currentNonce).to.equal(4)
          const sig = await signData(
            didReg,
            didRegAddress,
            signerAddress,
            signerAddress2,
            privateKey2,
            concat([toUtf8Bytes('revokeAttribute'), encryptionKey, toUtf8Bytes('mykey')]),
            1
          )
          await expect(
            didReg
              .connect(signers[5])
              .revokeAttributeSigned(signerAddress, sig.v, sig.r, sig.s, encryptionKey, toUtf8Bytes('mykey'))
          ).to.be.revertedWith('bad_signature')
        })
      })
    })
  })

  describe('Events', () => {
    it('can create list', async () => {
      const history: string[] = []
      let prevChange: number = Number(await didReg.changed(identity))
      while (prevChange) {
        const logs = await provider.getLogs({
          topics: [null, zeroPadValue(identity, 32)],
          fromBlock: prevChange,
          toBlock: prevChange,
        })
        prevChange = 0
        for (const log of logs) {
          const logDescription = didReg.interface.parseLog(log)!
          history.unshift(logDescription.name)
          prevChange = Number(logDescription.args.previousChange)
        }
      }
      // identity's complete history in this file: the canonical setup
      // changeOwner (accounts[0] -> delegate2) plus the msg.sender
      // addDelegate / revokeDelegate / setAttribute / revokeAttribute flows.
      // Together with the walker in registry.test.ts (issue 06, which asserts
      // identity's two DIDOwnerChanged events there), every event type the
      // legacy `Events` scenario asserted is covered — full parity.
      expect(history).to.deep.equal([
        'DIDOwnerChanged',
        'DIDDelegateChanged',
        'DIDDelegateChanged',
        'DIDAttributeChanged',
        'DIDAttributeChanged',
      ])
    })
  })
})

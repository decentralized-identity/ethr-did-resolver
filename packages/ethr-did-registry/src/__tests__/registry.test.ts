import { expect } from 'chai'
import { before, describe, it } from 'mocha'
import { concat, getBytes, toUtf8Bytes, zeroPadValue } from 'ethers'
import type { ContractTransactionReceipt, JsonRpcSigner, Provider } from 'ethers'
import type { EthereumDIDRegistry } from '../../typechain-types/index.js'
import type { DIDOwnerChangedEvent } from '../../typechain-types/EthereumDIDRegistry.js'
// Type augmentation for `.revertedWith` matcher
import '@nomicfoundation/hardhat-ethers-chai-matchers'
import { deployRegistry, signData } from './testUtils.js'

describe('ERC1056', () => {
  let didReg: EthereumDIDRegistry
  let didRegAddress: string
  let provider: Provider
  let signers: JsonRpcSigner[] // accounts[0..4]
  let identity: string // accounts[0]
  let identity2: string // accounts[1]
  let delegate: string // accounts[2]
  let delegate2: string // accounts[3]
  let badBoy: string // accounts[4]

  const privateKey = getBytes('0xa285ab66393c5fdda46d6fbad9e27fafd438254ab72ad5acb681a0e9f20f5d7b')
  const signerAddress = '0x2036C6CD85692F0Fb2C26E6c6B2ECed9e4478Dfd'

  const privateKey2 = getBytes('0xa285ab66393c5fdda46d6fbad9e27fafd438254ab72ad5acb681a0e9f20f5d7a')
  const signerAddress2 = '0xEA91e58E9Fa466786726F0a947e8583c7c5B3185'

  before(async () => {
    const harness = await deployRegistry()
    didReg = harness.registry
    didRegAddress = harness.registryAddress
    provider = harness.provider
    signers = harness.signers
    ;[identity, identity2, delegate, delegate2, badBoy] = await Promise.all(
      signers.map((signer) => signer.getAddress())
    )
  })

  describe('identityOwner()', () => {
    describe('default owner', () => {
      it('should return the identity address itself', async () => {
        const owner = await didReg.identityOwner(identity2)
        expect(owner).to.equal(identity2)
      })
    })

    describe('changed owner', () => {
      before(async () => {
        await (await didReg.connect(signers[1]).changeOwner(identity2, delegate)).wait()
      })
      it('should return the delegate address', async () => {
        const owner = await didReg.identityOwner(identity2)
        expect(owner).to.equal(delegate)
      })
    })
  })

  describe('changeOwner()', () => {
    describe('using msg.sender', () => {
      describe('as current owner', () => {
        let receipt: ContractTransactionReceipt
        before(async () => {
          const tx = await didReg.connect(signers[0]).changeOwner(identity, delegate)
          receipt = (await tx.wait())!
        })
        it('should change owner mapping', async () => {
          const owner = await didReg.owners(identity)
          expect(owner).to.equal(delegate)
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(identity)
          expect(Number(latest)).to.equal(receipt.blockNumber)
        })
        it('should create DIDOwnerChanged event', async () => {
          const event = didReg.interface.parseLog(receipt.logs[0]) as unknown as DIDOwnerChangedEvent.LogDescription
          expect(event.name).to.equal('DIDOwnerChanged')
          expect(event.args.identity).to.equal(identity)
          expect(event.args.owner).to.equal(delegate)
          expect(Number(event.args.previousChange)).to.equal(0)
        })
      })

      describe('as new owner', () => {
        let receipt: ContractTransactionReceipt
        let previousChange: number
        before(async () => {
          previousChange = Number(await didReg.changed(identity))
          const tx = await didReg.connect(signers[2]).changeOwner(identity, delegate2)
          receipt = (await tx.wait())!
        })
        it('should change owner mapping', async () => {
          const owner = await didReg.owners(identity)
          expect(owner).to.equal(delegate2)
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(identity)
          expect(Number(latest)).to.equal(receipt.blockNumber)
        })
        it('should create DIDOwnerChanged event', async () => {
          const event = didReg.interface.parseLog(receipt.logs[0]) as unknown as DIDOwnerChangedEvent.LogDescription
          expect(event.name).to.equal('DIDOwnerChanged')
          expect(event.args.identity).to.equal(identity)
          expect(event.args.owner).to.equal(delegate2)
          expect(Number(event.args.previousChange)).to.equal(previousChange)
        })
      })

      describe('as original owner', () => {
        it('should fail', async () => {
          await expect(didReg.connect(signers[0]).changeOwner(identity, identity)).to.be.revertedWith('bad_actor')
        })
      })

      describe('as attacker', () => {
        it('should fail', async () => {
          await expect(didReg.connect(signers[5]).changeOwner(identity, badBoy)).to.be.revertedWith('bad_actor')
        })
      })
    })

    describe('using signature', () => {
      describe('as current owner', () => {
        let receipt: ContractTransactionReceipt
        before(async () => {
          const sig = await signData(
            didReg,
            didRegAddress,
            signerAddress,
            signerAddress,
            privateKey,
            concat([toUtf8Bytes('changeOwner'), signerAddress2])
          )
          const tx = await didReg
            .connect(signers[5])
            .changeOwnerSigned(signerAddress, sig.v, sig.r, sig.s, signerAddress2)
          receipt = (await tx.wait())!
        })
        it('should change owner mapping', async () => {
          const owner2: string = await didReg.owners(signerAddress)
          expect(owner2).to.equal(signerAddress2)
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(signerAddress)
          expect(Number(latest)).to.equal(receipt.blockNumber)
        })
        it('should create DIDOwnerChanged event', async () => {
          const event = didReg.interface.parseLog(receipt.logs[0]) as unknown as DIDOwnerChangedEvent.LogDescription
          expect(event.name).to.equal('DIDOwnerChanged')
          expect(event.args.identity).to.equal(signerAddress)
          expect(event.args.owner).to.equal(signerAddress2)
          expect(Number(event.args.previousChange)).to.equal(0)
        })
      })

      describe('as original owner', () => {
        it('should fail', async () => {
          const sig = await signData(
            didReg,
            didRegAddress,
            signerAddress,
            signerAddress,
            privateKey,
            concat([toUtf8Bytes('changeOwner'), signerAddress])
          )
          await expect(
            didReg.connect(signers[5]).changeOwnerSigned(signerAddress, sig.v, sig.r, sig.s, signerAddress)
          ).to.be.revertedWith('bad_signature')
        })
      })

      describe('using wrong nonce', () => {
        it('should fail', async () => {
          const currentNonce = Number(await didReg.nonce(signerAddress2))
          expect(currentNonce).to.equal(0)
          const sig = await signData(
            didReg,
            didRegAddress,
            signerAddress,
            signerAddress2,
            privateKey2,
            concat([toUtf8Bytes('changeOwner'), signerAddress2]),
            1
          )
          await expect(
            didReg.connect(signers[5]).changeOwnerSigned(signerAddress, sig.v, sig.r, sig.s, signerAddress2)
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
      // The full legacy history also contains the DIDDelegateChanged and
      // DIDAttributeChanged events emitted by the delegation suite (issue 07);
      // within this file's scope identity only receives its two owner changes.
      expect(history).to.deep.equal(['DIDOwnerChanged', 'DIDOwnerChanged'])
    })
  })
})

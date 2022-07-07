// noinspection DuplicatedCode

import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { ContractTransaction } from 'ethers'
import { Block, Log } from '@ethersproject/providers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import {
  arrayify,
  concat,
  formatBytes32String,
  hexConcat,
  hexlify,
  hexZeroPad,
  keccak256,
  parseBytes32String,
  SigningKey,
  toUtf8Bytes,
  zeroPad,
} from 'ethers/lib/utils'
import {
  DIDAttributeChangedEvent,
  DIDDelegateChangedEvent,
  DIDOwnerChangedEvent,
  EthereumDIDRegistry,
} from '../typechain-types/EthereumDIDRegistry'

chai.use(chaiAsPromised)

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ethers } = require('hardhat')

describe('ERC1056', () => {
  let didReg: EthereumDIDRegistry
  let identity: SignerWithAddress // = accounts[0];
  let identity2: SignerWithAddress // = accounts[1];
  let delegate: SignerWithAddress // = accounts[2];
  let delegate2: SignerWithAddress // = accounts[3];
  let delegate3: SignerWithAddress // = accounts[4];
  let badBoy: SignerWithAddress // = accounts[5];

  before(async () => {
    const Registry = await ethers.getContractFactory('EthereumDIDRegistry')
    didReg = await Registry.deploy()
    await didReg.deployed()
    ;[identity, identity2, delegate, delegate2, delegate3, badBoy] = await ethers.getSigners()
  })

  const privateKey = arrayify('0xa285ab66393c5fdda46d6fbad9e27fafd438254ab72ad5acb681a0e9f20f5d7b')
  const signerAddress = '0x2036C6CD85692F0Fb2C26E6c6B2ECed9e4478Dfd'

  const privateKey2 = arrayify('0xa285ab66393c5fdda46d6fbad9e27fafd438254ab72ad5acb681a0e9f20f5d7a')
  const signerAddress2 = '0xEA91e58E9Fa466786726F0a947e8583c7c5B3185'

  async function signData(
    identity: string,
    signerAddress: string,
    privateKeyBytes: Uint8Array,
    dataBytes: Uint8Array,
    nonce?: number
  ) {
    const _nonce = nonce || (await didReg.nonce(signerAddress))
    const paddedNonce = zeroPad(arrayify(_nonce), 32)
    const dataToSign = hexConcat(['0x1900', didReg.address, paddedNonce, identity, dataBytes])
    const hash = keccak256(dataToSign)
    return new SigningKey(privateKeyBytes).signDigest(hash)
  }

  describe('identityOwner()', () => {
    describe('default owner', () => {
      it('should return the identity address itself', async () => {
        const owner = await didReg.identityOwner(identity2.address)
        expect(owner).to.equal(identity2.address)
      })
    })

    describe('changed owner', () => {
      before(async () => {
        await didReg.connect(identity2).changeOwner(identity2.address, delegate.address)
      })
      it('should return the delegate address', async () => {
        const owner = await didReg.identityOwner(identity2.address)
        expect(owner).to.equal(delegate.address)
      })
    })
  })

  describe('changeOwner()', () => {
    describe('using msg.sender', () => {
      describe('as current owner', () => {
        let tx: ContractTransaction
        before(async () => {
          tx = await didReg.connect(identity).changeOwner(identity.address, delegate.address)
        })
        it('should change owner mapping', async () => {
          const owner = await didReg.owners(identity.address)
          expect(owner).to.equal(delegate.address)
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(identity.address)
          expect(latest).to.equal(tx.blockNumber)
        })
        it('should create DIDDelegateChanged event', async () => {
          const event = (await tx.wait()).events?.[0] as DIDOwnerChangedEvent
          expect(event.event).to.equal('DIDOwnerChanged')
          expect(event.args.identity).to.equal(identity.address)
          expect(event.args.owner).to.equal(delegate.address)
          expect(event.args.previousChange.toNumber()).to.equal(0)
        })
      })

      describe('as new owner', () => {
        let tx: ContractTransaction
        let previousChange: number
        before(async () => {
          previousChange = (await didReg.changed(identity.address)).toNumber()
          tx = await didReg.connect(delegate).changeOwner(identity.address, delegate2.address)
        })
        it('should change owner mapping', async () => {
          const owner = await didReg.owners(identity.address)
          expect(owner).to.equal(delegate2.address)
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(identity.address)
          expect(latest).to.equal((await tx.wait()).blockNumber)
        })
        it('should create DIDOwnerChanged event', async () => {
          const event = (await tx.wait()).events?.[0] as DIDOwnerChangedEvent
          expect(event.event).to.equal('DIDOwnerChanged')
          expect(event.args.identity).to.equal(identity.address)
          expect(event.args.owner).to.equal(delegate2.address)
          expect(event.args.previousChange.toNumber()).to.equal(previousChange)
        })
      })

      describe('as original owner', () => {
        it('should fail', async () => {
          await expect(didReg.connect(identity).changeOwner(identity.address, identity.address)).to.be.rejectedWith(
            /bad_actor/
          )
        })
      })

      describe('as attacker', () => {
        it('should fail', async () => {
          await expect(didReg.connect(badBoy).changeOwner(identity.address, badBoy.address)).to.be.rejectedWith(
            /bad_actor/
          )
        })
      })
    })

    describe('using signature', () => {
      let tx: ContractTransaction

      describe('as current owner', () => {
        before(async () => {
          const sig = await signData(
            signerAddress,
            signerAddress,
            privateKey,
            concat([toUtf8Bytes('changeOwner'), signerAddress2])
          )
          tx = await didReg.connect(badBoy).changeOwnerSigned(signerAddress, sig.v, sig.r, sig.s, signerAddress2)
        })
        it('should change owner mapping', async () => {
          const owner2: string = await didReg.owners(signerAddress)
          expect(owner2).to.equal(signerAddress2)
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(signerAddress)
          expect(latest).to.equal(tx.blockNumber)
        })
        it('should create DIDOwnerChanged event', async () => {
          const event = (await tx.wait()).events?.[0] as DIDOwnerChangedEvent
          expect(event.event).to.equal('DIDOwnerChanged')
          expect(event.args.identity).to.equal(signerAddress)
          expect(event.args.owner).to.equal(signerAddress2)
          expect(event.args.previousChange.toNumber()).to.equal(0)
        })
      })

      describe('as original owner', () => {
        it('should fail', async () => {
          const sig = await signData(
            signerAddress,
            signerAddress,
            privateKey,
            concat([toUtf8Bytes('changeOwner'), signerAddress])
          )
          await expect(
            didReg.connect(badBoy).changeOwnerSigned(signerAddress, sig.v, sig.r, sig.s, signerAddress)
          ).to.be.rejectedWith(/bad_signature/)
        })
      })

      describe('using wrong nonce', () => {
        it('should fail', async () => {
          const currentNonce = (await didReg.nonce(signerAddress2)).toNumber()
          expect(currentNonce).to.equal(0)
          const sig = await signData(
            signerAddress,
            signerAddress2,
            privateKey2,
            concat([toUtf8Bytes('changeOwner'), signerAddress2]),
            1
          )
          await expect(
            didReg.connect(badBoy).changeOwnerSigned(signerAddress, sig.v, sig.r, sig.s, signerAddress2)
          ).to.be.rejectedWith(/bad_signature/)
        })
      })
    })
  })

  describe('addDelegate()', () => {
    describe('using msg.sender', () => {
      it('validDelegate should be false', async () => {
        const valid = await didReg.validDelegate(identity.address, formatBytes32String('attestor'), delegate3.address)
        expect(valid).to.equal(false) // we have not yet assigned delegate correctly
      })

      describe('as current owner', () => {
        let tx: ContractTransaction
        let block: Block
        let previousChange: number
        before(async () => {
          previousChange = (await didReg.changed(identity.address)).toNumber()
          tx = await didReg
            .connect(delegate2)
            .addDelegate(identity.address, formatBytes32String('attestor'), delegate3.address, 86400)
          block = await ethers.provider.getBlock((await tx.wait()).blockNumber)
        })
        it('validDelegate should be true', async () => {
          const valid = await didReg.validDelegate(identity.address, formatBytes32String('attestor'), delegate3.address)
          expect(valid).to.equal(true) // assigned delegate correctly
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(identity.address)
          expect(latest).to.equal((await tx.wait()).blockNumber)
        })
        it('should create DIDDelegateChanged event', async () => {
          const event = (await tx.wait()).events?.[0] as DIDDelegateChangedEvent
          expect(event.event).to.equal('DIDDelegateChanged')
          expect(event.args.identity).to.equal(identity.address)
          expect(parseBytes32String(event.args.delegateType)).to.equal('attestor')
          expect(event.args.delegate).to.equal(delegate3.address)
          expect(event.args.validTo.toNumber()).to.equal(block.timestamp + 86400)
          expect(event.args.previousChange.toNumber()).to.equal(previousChange)
        })
      })

      describe('as original owner', () => {
        it('should fail', async () => {
          const currentOwnerAddress = await didReg.owners(identity.address)
          expect(currentOwnerAddress).not.to.equal(identity.address)
          await expect(
            didReg
              .connect(identity)
              .addDelegate(identity.address, formatBytes32String('attestor'), badBoy.address, 86400)
          ).to.be.rejectedWith(/bad_actor/)
        })
      })

      describe('as attacker', () => {
        it('should fail', async () => {
          await expect(
            didReg.connect(badBoy).addDelegate(identity.address, formatBytes32String('attestor'), badBoy.address, 86400)
          ).to.be.rejectedWith(/bad_actor/)
        })
      })
    })

    describe('using signature', () => {
      describe('as current owner', () => {
        let tx: ContractTransaction
        let block: Block
        let previousChange: number
        before(async () => {
          previousChange = (await didReg.changed(signerAddress)).toNumber()
          const sig = await signData(
            signerAddress,
            signerAddress2,
            privateKey2,
            concat([
              toUtf8Bytes('addDelegate'),
              formatBytes32String('attestor'),
              delegate.address,
              zeroPad(hexlify(86400), 32),
            ])
          )
          tx = await didReg
            .connect(badBoy)
            .addDelegateSigned(
              signerAddress,
              sig.v,
              sig.r,
              sig.s,
              formatBytes32String('attestor'),
              delegate.address,
              86400
            )
          block = await ethers.provider.getBlock((await tx.wait()).blockNumber)
        })
        it('validDelegate should be true', async () => {
          const valid = await didReg.validDelegate(signerAddress, formatBytes32String('attestor'), delegate.address)
          expect(valid).to.equal(true) // assigned delegate correctly
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(signerAddress)
          expect(latest.toNumber()).to.equal((await tx.wait()).blockNumber)
        })
        it('should create DIDDelegateChanged event', async () => {
          const event = (await tx.wait()).events?.[0] as DIDDelegateChangedEvent
          expect(event.event).to.equal('DIDDelegateChanged')
          expect(event.args.identity).to.equal(signerAddress)
          expect(parseBytes32String(event.args.delegateType), 'attestor')
          expect(event.args.delegate).to.equal(delegate.address)
          expect(event.args.validTo.toNumber()).to.equal(block.timestamp + 86400)
          expect(event.args.previousChange.toNumber()).to.equal(previousChange)
        })
      })

      describe('as wrong owner', () => {
        it('should fail', async () => {
          const sig = await signData(
            signerAddress,
            signerAddress,
            privateKey,
            concat([
              toUtf8Bytes('addDelegate'),
              formatBytes32String('attestor'),
              delegate.address,
              zeroPad(hexlify(86400), 32),
            ])
          )
          await expect(
            didReg
              .connect(badBoy)
              .addDelegateSigned(
                signerAddress,
                sig.v,
                sig.r,
                sig.s,
                formatBytes32String('attestor'),
                delegate.address,
                86400
              )
          ).to.be.rejectedWith(/bad_signature/)
        })
      })

      describe('using wrong nonce', () => {
        it('should fail', async () => {
          const currentNonce = (await didReg.nonce(signerAddress2)).toNumber()
          expect(currentNonce).to.equal(1)
          const sig = await signData(
            signerAddress,
            signerAddress2,
            privateKey2,
            concat([
              toUtf8Bytes('addDelegate'),
              formatBytes32String('attestor'),
              delegate.address,
              zeroPad(hexlify(86400), 32),
            ]),
            2
          )
          await expect(
            didReg
              .connect(badBoy)
              .addDelegateSigned(
                signerAddress,
                sig.v,
                sig.r,
                sig.s,
                formatBytes32String('attestor'),
                delegate.address,
                86400
              )
          ).to.be.rejectedWith(/bad_signature/)
        })
      })
    })
  })

  describe('revokeDelegate()', () => {
    describe('using msg.sender', () => {
      it('validDelegate should be true', async () => {
        const valid = await didReg.validDelegate(identity.address, formatBytes32String('attestor'), delegate3.address)
        expect(valid).to.equal(true) // not yet revoked
      })

      describe('as current owner', () => {
        let tx: ContractTransaction
        let previousChange: number
        before(async () => {
          previousChange = (await didReg.changed(identity.address)).toNumber()
          tx = await didReg
            .connect(delegate2)
            .revokeDelegate(identity.address, formatBytes32String('attestor'), delegate3.address)
        })
        it('validDelegate should be false', async () => {
          const valid = await didReg.validDelegate(identity.address, formatBytes32String('attestor'), delegate3.address)
          expect(valid).to.equal(false) // revoked correctly
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(identity.address)
          expect(latest).to.equal((await tx.wait()).blockNumber)
        })
        it('should create DIDDelegateChanged event', async () => {
          const event = (await tx.wait()).events?.[0] as DIDDelegateChangedEvent
          expect(event.event).to.equal('DIDDelegateChanged')
          expect(event.args.identity).to.equal(identity.address)
          expect(parseBytes32String(event.args.delegateType)).to.equal('attestor')
          expect(event.args.delegate).to.equal(delegate3.address)
          expect(event.args.validTo.toNumber()).to.be.lessThanOrEqual(
            (await ethers.provider.getBlock(tx.blockNumber)).timestamp
          )
          expect(event.args.previousChange.toNumber()).to.equal(previousChange)
        })
      })

      describe('as original owner', () => {
        it('should fail', async () => {
          const currentOwnerAddress = await didReg.owners(identity.address)
          expect(currentOwnerAddress).not.to.equal(identity.address)
          await expect(
            didReg.connect(identity).revokeDelegate(identity.address, formatBytes32String('attestor'), badBoy.address)
          ).to.be.rejectedWith(/bad_actor/)
        })
      })

      describe('as attacker', () => {
        it('should fail', async () => {
          await expect(
            didReg.connect(badBoy).revokeDelegate(identity.address, formatBytes32String('attestor'), badBoy.address)
          ).to.be.revertedWith('bad_actor')
        })
      })
    })

    describe('using signature', () => {
      describe('as current owner', () => {
        let tx: ContractTransaction
        let previousChange: number
        before(async () => {
          previousChange = (await didReg.changed(signerAddress)).toNumber()
          const sig = await signData(
            signerAddress,
            signerAddress2,
            privateKey2,
            concat([toUtf8Bytes('revokeDelegate'), formatBytes32String('attestor'), delegate.address])
          )
          tx = await didReg
            .connect(badBoy)
            .revokeDelegateSigned(signerAddress, sig.v, sig.r, sig.s, formatBytes32String('attestor'), delegate.address)
        })
        it('validDelegate should be false', async () => {
          const valid = await didReg.validDelegate(signerAddress, formatBytes32String('attestor'), delegate.address)
          expect(valid).to.equal(false) // revoked delegate correctly
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(signerAddress)
          expect(latest).to.equal((await tx.wait()).blockNumber)
        })
        it('should create DIDDelegateChanged event', async () => {
          const event = (await tx.wait()).events?.[0] as DIDDelegateChangedEvent
          expect(event.event).to.equal('DIDDelegateChanged')
          expect(event.args.identity).to.equal(signerAddress)
          expect(parseBytes32String(event.args.delegateType)).to.equal('attestor')
          expect(event.args.delegate).to.equal(delegate.address)
          expect(event.args.validTo.toNumber()).to.be.lessThanOrEqual(
            (await ethers.provider.getBlock(tx.blockNumber)).timestamp
          )
          expect(event.args.previousChange.toNumber()).to.equal(previousChange)
        })
      })

      describe('as wrong owner', () => {
        it('should fail', async () => {
          const sig = await signData(
            signerAddress,
            signerAddress,
            privateKey,
            concat([toUtf8Bytes('revokeDelegate'), formatBytes32String('attestor'), delegate.address])
          )
          await expect(
            didReg
              .connect(badBoy)
              .revokeDelegateSigned(
                signerAddress,
                sig.v,
                sig.r,
                sig.s,
                formatBytes32String('attestor'),
                delegate.address
              )
          ).to.be.rejectedWith(/bad_signature/)
        })
      })

      describe('using wrong nonce', () => {
        it('should fail', async () => {
          const currentNonce = (await didReg.nonce(signerAddress2)).toNumber()
          expect(currentNonce).to.equal(2)
          const sig = await signData(
            signerAddress,
            signerAddress2,
            privateKey2,
            concat([toUtf8Bytes('revokeDelegate'), formatBytes32String('attestor'), delegate.address]),
            1
          )
          await expect(
            didReg
              .connect(badBoy)
              .revokeDelegateSigned(
                signerAddress,
                sig.v,
                sig.r,
                sig.s,
                formatBytes32String('attestor'),
                delegate.address
              )
          ).to.be.rejectedWith(/bad_signature/)
        })
      })
    })
  })

  describe('setAttribute()', () => {
    describe('using msg.sender', () => {
      describe('as current owner', () => {
        let tx: ContractTransaction
        let block: Block
        let previousChange: number
        before(async () => {
          previousChange = (await didReg.changed(identity.address)).toNumber()
          const currentOwnerAddress = await didReg.owners(identity.address)
          const signer = (await ethers.getSigners()).find(
            (signer: SignerWithAddress) => signer.address === currentOwnerAddress
          )
          tx = await didReg
            .connect(signer)
            .setAttribute(identity.address, formatBytes32String('encryptionKey'), toUtf8Bytes('mykey'), 86400)
          block = await ethers.provider.getBlock((await tx.wait()).blockNumber)
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(identity.address)
          expect(latest).to.equal((await tx.wait()).blockNumber)
        })
        it('should create DIDAttributeChanged event', async () => {
          const event = (await tx.wait()).events?.[0] as DIDAttributeChangedEvent
          expect(event.event).to.equal('DIDAttributeChanged')
          expect(event.args.identity).to.equal(identity.address)
          expect(parseBytes32String(event.args.name)).to.equal('encryptionKey')
          expect(event.args.value).to.equal('0x6d796b6579') // the hex encoding of the string "mykey"
          expect(event.args.validTo.toNumber()).to.equal(block.timestamp + 86400)
          expect(event.args.previousChange.toNumber()).to.equal(previousChange)
        })
      })

      describe('as original owner', () => {
        it('should fail', async () => {
          const currentOwnerAddress = await didReg.owners(identity.address)
          expect(currentOwnerAddress).not.to.equal(identity.address)
          await expect(
            didReg
              .connect(identity)
              .setAttribute(identity.address, formatBytes32String('encryptionKey'), toUtf8Bytes('mykey'), 86400)
          ).to.be.rejectedWith(/bad_actor/)
        })
      })

      describe('as attacker', () => {
        it('should fail', async () => {
          await expect(
            didReg
              .connect(badBoy)
              .setAttribute(identity.address, formatBytes32String('encryptionKey'), toUtf8Bytes('mykey'), 86400)
          ).to.be.rejectedWith(/bad_actor/)
        })
      })
    })

    describe('using signature', () => {
      describe('as current owner', () => {
        let tx: ContractTransaction
        let block: Block
        let previousChange: number
        before(async () => {
          previousChange = (await didReg.changed(signerAddress)).toNumber()
          const sig = await signData(
            signerAddress,
            signerAddress2,
            privateKey2,
            concat([
              toUtf8Bytes('setAttribute'),
              formatBytes32String('encryptionKey'),
              toUtf8Bytes('mykey'),
              zeroPad(hexlify(86400), 32),
            ])
          )
          tx = await didReg
            .connect(badBoy)
            .setAttributeSigned(
              signerAddress,
              sig.v,
              sig.r,
              sig.s,
              formatBytes32String('encryptionKey'),
              toUtf8Bytes('mykey'),
              86400
            )
          block = await ethers.provider.getBlock((await tx.wait()).blockNumber)
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(signerAddress)
          expect(latest).to.equal((await tx.wait()).blockNumber)
        })
        it('should create DIDDelegateChanged event', async () => {
          const event = (await tx.wait()).events?.[0] as DIDAttributeChangedEvent
          expect(event.event).to.equal('DIDAttributeChanged')
          expect(event.args.identity).to.equal(signerAddress)
          expect(parseBytes32String(event.args.name)).to.equal('encryptionKey')
          expect(event.args.value).to.equal('0x6d796b6579') // the hex encoding of the string "mykey"
          expect(event.args.validTo.toNumber()).to.equal(block.timestamp + 86400)
          expect(event.args.previousChange.toNumber()).to.equal(previousChange)
        })
      })

      describe('as wrong owner', () => {
        it('should fail', async () => {
          const sig = await signData(
            signerAddress,
            signerAddress,
            privateKey,
            concat([
              toUtf8Bytes('setAttribute'),
              formatBytes32String('encryptionKey'),
              toUtf8Bytes('mykey'),
              zeroPad(hexlify(86400), 32),
            ])
          )
          await expect(
            didReg
              .connect(badBoy)
              .setAttributeSigned(
                signerAddress,
                sig.v,
                sig.r,
                sig.s,
                formatBytes32String('encryptionKey'),
                toUtf8Bytes('mykey'),
                86400
              )
          ).to.be.rejectedWith(/bad_signature/)
        })
      })

      describe('using wrong nonce', () => {
        it('should fail', async () => {
          const currentNonce = (await didReg.nonce(signerAddress2)).toNumber()
          expect(currentNonce).to.equal(3)
          const sig = await signData(
            signerAddress,
            signerAddress2,
            privateKey2,
            concat([
              toUtf8Bytes('setAttribute'),
              formatBytes32String('encryptionKey'),
              toUtf8Bytes('mykey'),
              zeroPad(hexlify(86400), 32),
            ]),
            1
          )
          await expect(
            didReg
              .connect(badBoy)
              .setAttributeSigned(
                signerAddress,
                sig.v,
                sig.r,
                sig.s,
                formatBytes32String('encryptionKey'),
                toUtf8Bytes('mykey'),
                86400
              )
          ).to.be.rejectedWith(/bad_signature/)
        })
      })
    })
  })

  describe('revokeAttribute()', () => {
    describe('using msg.sender', () => {
      describe('as current owner', () => {
        let tx: ContractTransaction
        let previousChange: number
        before(async () => {
          previousChange = (await didReg.changed(identity.address)).toNumber()
          const currentOwnerAddress = await didReg.owners(identity.address)
          const signer = (await ethers.getSigners()).find(
            (signer: SignerWithAddress) => signer.address === currentOwnerAddress
          )
          tx = await didReg
            .connect(signer)
            .revokeAttribute(identity.address, formatBytes32String('encryptionKey'), toUtf8Bytes('mykey'))
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(identity.address)
          expect(latest).to.equal((await tx.wait()).blockNumber)
        })
        it('should create DIDAttributeChanged event', async () => {
          const event = (await tx.wait()).events?.[0] as DIDAttributeChangedEvent
          expect(event.event).to.equal('DIDAttributeChanged')
          expect(event.args.identity).to.equal(identity.address)
          expect(parseBytes32String(event.args.name)).to.equal('encryptionKey')
          expect(event.args.value).to.equal('0x6d796b6579') // hex encoding of the string "mykey"
          expect(event.args.validTo.toNumber()).to.equal(0)
          expect(event.args.previousChange.toNumber()).to.equal(previousChange)
        })
      })

      describe('as original owner', () => {
        it('should fail', async () => {
          const currentOwnerAddress = await didReg.owners(identity.address)
          expect(currentOwnerAddress).not.to.equal(identity.address)
          await expect(
            didReg
              .connect(identity)
              .revokeAttribute(identity.address, formatBytes32String('encryptionKey'), toUtf8Bytes('mykey'))
          ).to.be.rejectedWith(/bad_actor/)
        })
      })

      describe('as attacker', () => {
        it('should fail', async () => {
          await expect(
            didReg
              .connect(badBoy)
              .revokeAttribute(identity.address, formatBytes32String('encryptionKey'), toUtf8Bytes('mykey'))
          ).to.be.rejectedWith(/bad_actor/)
        })
      })
    })

    describe('using signature', () => {
      describe('as current owner', () => {
        let tx: ContractTransaction
        let previousChange: number
        before(async () => {
          previousChange = (await didReg.changed(signerAddress)).toNumber()
          const sig = await signData(
            signerAddress,
            signerAddress2,
            privateKey2,
            concat([toUtf8Bytes('revokeAttribute'), formatBytes32String('encryptionKey'), toUtf8Bytes('mykey')])
          )
          tx = await didReg
            .connect(badBoy)
            .revokeAttributeSigned(
              signerAddress,
              sig.v,
              sig.r,
              sig.s,
              formatBytes32String('encryptionKey'),
              toUtf8Bytes('mykey')
            )
        })
        it('should sets changed to transaction block', async () => {
          const latest = await didReg.changed(signerAddress)
          expect(latest).to.equal((await tx.wait()).blockNumber)
        })
        it('should create DIDDelegateChanged event', async () => {
          const event = (await tx.wait()).events?.[0] as DIDAttributeChangedEvent
          expect(event.event).to.equal('DIDAttributeChanged')
          expect(event.args.identity).to.equal(signerAddress)
          expect(parseBytes32String(event.args.name)).to.equal('encryptionKey')
          expect(event.args.value).to.equal('0x6d796b6579') // hex encoding of the string "mykey"
          expect(event.args.validTo.toNumber()).to.equal(0)
          expect(event.args.previousChange.toNumber()).to.equal(previousChange)
        })
      })

      describe('as wrong owner', () => {
        it('should fail', async () => {
          const sig = await signData(
            signerAddress,
            signerAddress,
            privateKey,
            concat([toUtf8Bytes('revokeAttribute'), formatBytes32String('encryptionKey'), toUtf8Bytes('mykey')])
          )
          await expect(
            didReg
              .connect(badBoy)
              .revokeAttributeSigned(
                signerAddress,
                sig.v,
                sig.r,
                sig.s,
                formatBytes32String('encryptionKey'),
                toUtf8Bytes('mykey')
              )
          ).to.be.rejectedWith(/bad_signature/)
        })
      })

      describe('using wrong nonce', () => {
        it('should fail', async () => {
          const currentNonce = (await didReg.nonce(signerAddress2)).toNumber()
          expect(currentNonce).to.equal(4)
          const sig = await signData(
            signerAddress,
            signerAddress2,
            privateKey2,
            concat([toUtf8Bytes('revokeAttribute'), formatBytes32String('encryptionKey'), toUtf8Bytes('mykey')]),
            1
          )
          await expect(
            didReg
              .connect(badBoy)
              .revokeAttributeSigned(
                signerAddress,
                sig.v,
                sig.r,
                sig.s,
                formatBytes32String('encryptionKey'),
                toUtf8Bytes('mykey')
              )
          ).to.be.rejectedWith(/bad_signature/)
        })
      })
    })
  })

  describe('Events', () => {
    it('can create list', async () => {
      const history = []
      let prevChange: number = (await didReg.changed(identity.address)).toNumber()
      while (prevChange) {
        const logs: Log[] = await ethers.provider.getLogs({
          topics: [null, hexZeroPad(identity.address, 32)],
          fromBlock: prevChange,
          toBlock: prevChange,
        })
        prevChange = 0
        for (const log of logs) {
          const logDescription = didReg.interface.parseLog(log)
          history.unshift(logDescription.name)
          prevChange = logDescription.args.previousChange.toNumber()
        }
      }
      expect(history).to.deep.equal([
        'DIDOwnerChanged',
        'DIDOwnerChanged',
        'DIDDelegateChanged',
        'DIDDelegateChanged',
        'DIDAttributeChanged',
        'DIDAttributeChanged',
      ])
    })
  })
})

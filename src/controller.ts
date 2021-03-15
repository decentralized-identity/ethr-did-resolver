import { Signer } from '@ethersproject/abstract-signer'
import { CallOverrides, Contract } from '@ethersproject/contracts'
import { BlockTag, JsonRpcProvider, TransactionReceipt } from '@ethersproject/providers'
import { address, interpretIdentifier, stringToBytes32 } from './helpers'

export class EthrDidController {
  private contract: Contract
  private signer?: Signer
  private address: string

  constructor(identifier: string | address, contract: Contract, signer?: Signer) {
    this.contract = contract
    this.signer = signer
    const { address } = interpretIdentifier(identifier)
    this.address = address
  }

  async getOwner(address: address, blockTag?: BlockTag): Promise<string> {
    const result = await this.contract.functions.identityOwner(address, { blockTag })
    return result[0]
  }

  async attachContract(controller?: address | Promise<address>): Promise<Contract> {
    const currentOwner = controller ? await controller : await this.getOwner(this.address, 'latest')
    const signer = this.signer
      ? this.signer
      : (<JsonRpcProvider>this.contract.provider).getSigner(currentOwner) || this.contract.signer
    return this.contract.connect(signer)
  }

  async changeOwner(newOwner: address, options: CallOverrides = {}): Promise<TransactionReceipt> {
    // console.log(`changing owner for ${oldOwner} on registry at ${registryContract.address}`)
    const overrides = {
      gasLimit: 123456,
      gasPrice: 1000000000,
      ...options,
    }

    const contract = await this.attachContract(overrides.from)
    delete overrides.from

    const ownerChange = await contract.functions.changeOwner(this.address, newOwner, overrides)
    return await ownerChange.wait()
  }

  async addDelegate(
    delegateType: string,
    delegateAddress: address,
    exp: number,
    options: CallOverrides = {}
  ): Promise<TransactionReceipt> {
    const overrides = {
      gasLimit: 123456,
      gasPrice: 1000000000,
      ...options,
    }
    const contract = await this.attachContract(overrides.from)
    delete overrides.from

    const delegateTypeBytes = stringToBytes32(delegateType)
    const addDelegateTx = await contract.functions.addDelegate(
      this.address,
      delegateTypeBytes,
      delegateAddress,
      exp,
      overrides
    )
    addDelegateTx
    return await addDelegateTx.wait()
  }

  async revokeDelegate(
    delegateType: string,
    delegateAddress: address,
    options: CallOverrides = {}
  ): Promise<TransactionReceipt> {
    const overrides = {
      gasLimit: 123456,
      gasPrice: 1000000000,
      ...options,
    }
    delegateType = delegateType.startsWith('0x') ? delegateType : stringToBytes32(delegateType)
    const contract = await this.attachContract(overrides.from)
    delete overrides.from
    const addDelegateTx = await contract.functions.revokeDelegate(
      this.address,
      delegateType,
      delegateAddress,
      overrides
    )
    return await addDelegateTx.wait()
  }

  async setAttribute(
    attrName: string,
    attrValue: string,
    exp: number,
    options: CallOverrides = {}
  ): Promise<TransactionReceipt> {
    const overrides = {
      gasLimit: 123456,
      gasPrice: 1000000000,
      controller: undefined,
      ...options,
    }
    attrName = attrName.startsWith('0x') ? attrName : stringToBytes32(attrName)
    attrValue = attrValue.startsWith('0x') ? attrValue : '0x' + Buffer.from(attrValue, 'utf-8').toString('hex')
    const contract = await this.attachContract(overrides.from)
    delete overrides.from
    const setAttrTx = await contract.functions.setAttribute(this.address, attrName, attrValue, exp, overrides)
    return await setAttrTx.wait()
  }

  async revokeAttribute(attrName: string, attrValue: string, options: CallOverrides = {}): Promise<TransactionReceipt> {
    // console.log(`revoking attribute ${attrName}(${attrValue}) for ${identity}`)
    const overrides = {
      gasLimit: 123456,
      gasPrice: 1000000000,
      ...options,
    }
    attrName = attrName.startsWith('0x') ? attrName : stringToBytes32(attrName)
    attrValue = attrValue.startsWith('0x') ? attrValue : '0x' + Buffer.from(attrValue, 'utf-8').toString('hex')
    const contract = await this.attachContract(overrides.from)
    delete overrides.from
    const revokeAttributeTX = await contract.functions.revokeAttribute(this.address, attrName, attrValue, overrides)
    return await revokeAttributeTX.wait()
  }
}

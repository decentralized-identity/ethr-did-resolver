import { Signer } from '@ethersproject/abstract-signer'
import { Contract } from '@ethersproject/contracts'
import { BlockTag, JsonRpcProvider } from '@ethersproject/providers'
import { interpretIdentifier, stringToBytes32 } from './utils'

export class EthrDidController {
  private contract: Contract
  private signer?: Signer
  private address: string

  constructor(identifier: string, contract: Contract, signer?: Signer) {
    this.contract = contract
    this.signer = signer
    const { address } = interpretIdentifier(identifier)
    this.address = address
  }

  async getOwner(address: string, blockTag?: BlockTag): Promise<string> {
    const result = await this.contract.functions.identityOwner(address, { blockTag })
    return result[0]
  }

  async attachContract(controller?: string): Promise<Contract> {
    const currentOwner = controller ? controller : await this.getOwner(this.address, 'latest')
    const signer = this.signer
      ? this.signer
      : (<JsonRpcProvider>this.contract.provider).getSigner(currentOwner) || this.contract.signer
    return this.contract.connect(signer)
  }

  async changeOwner(newOwner: string, options: any) {
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

  async addDelegate(delegateType: string, delegateAddress: string, exp: number, options: any) {
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

  async revokeDelegate(delegateType: string, delegateAddress: string, options: any) {
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

  async setAttribute(attrName: string, attrValue: string, exp: number, options: any) {
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

  async revokeAttribute(attrName: string, attrValue: string, options: any) {
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

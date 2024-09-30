import {
  Addressable,
  AddressLike,
  BlockTag,
  concat,
  Contract,
  encodeBytes32String,
  getBytes,
  hexlify,
  isHexString,
  JsonRpcProvider,
  keccak256,
  Overrides,
  Provider,
  Signer,
  toBeHex,
  toUtf8Bytes,
  TransactionReceipt,
  zeroPadValue,
} from 'ethers'
import { getContractForNetwork } from './configuration.js'
import {
  address,
  DEFAULT_REGISTRY_ADDRESS,
  interpretIdentifier,
  MESSAGE_PREFIX,
  MetaSignature,
  stringToBytes32,
} from './helpers.js'

/**
 * A class that can be used to interact with the ERC1056 contract on behalf of a local controller key-pair
 */
export class EthrDidController {
  private contract: Contract
  private readonly signer?: Signer
  private readonly address: string
  public readonly did: string
  private readonly legacyNonce: boolean

  /**
   * Creates an EthrDidController instance.
   *
   * @param identifier - required - a `did:ethr` string or a publicKeyHex or an ethereum address
   * @param signer - optional - a Signer that represents the current controller key (owner) of the identifier. If a
   *   'signer' is not provided, then a 'contract' with an attached signer can be used.
   * @param contract - optional - a Contract instance representing a ERC1056 contract. At least one of `contract`,
   *   `provider`, or `rpcUrl` is required
   * @param chainNameOrId - optional - the network name or chainID, defaults to 'mainnet'
   * @param provider - optional - a web3 Provider. At least one of `contract`, `provider`, or `rpcUrl` is required
   * @param rpcUrl - optional - a JSON-RPC URL that can be used to connect to an ethereum network. At least one of
   *   `contract`, `provider`, or `rpcUrl` is required
   * @param registry - optional - The ERC1056 registry address. Defaults to
   *   '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b'. Only used with 'provider' or 'rpcUrl'
   * @param legacyNonce - optional - If the legacy nonce tracking method should be accounted for. If lesser version of
   *   did-ethr-registry contract v1.0.0 is used then this should be true.
   */
  constructor(
    identifier: string | address,
    contract?: Contract,
    signer?: Signer,
    chainNameOrId = 'mainnet',
    provider?: Provider,
    rpcUrl?: string,
    registry: string = DEFAULT_REGISTRY_ADDRESS,
    legacyNonce = true
  ) {
    this.legacyNonce = legacyNonce
    // initialize identifier
    const { address, publicKey, network } = interpretIdentifier(identifier)
    const net = network || chainNameOrId
    // initialize contract connection
    if (contract) {
      this.contract = contract
    } else if (provider || signer?.provider || rpcUrl) {
      const prov = provider || signer?.provider
      this.contract = getContractForNetwork({ name: net, provider: prov, registry, rpcUrl })
    } else {
      throw new Error(' either a contract instance or a provider or rpcUrl is required to initialize')
    }
    this.signer = signer
    this.address = address
    let networkString = net ? `${net}:` : ''
    if (networkString in ['mainnet:', '0x1:']) {
      networkString = ''
    }
    this.did = publicKey ? `did:ethr:${networkString}${publicKey}` : `did:ethr:${networkString}${address}`
  }

  /**
   * @returns the encoded attribute value in hex or utf8 bytes
   * @param attrValue - the attribute value to encode (e.g. service endpoint, public key, etc.)
   *
   * @remarks The incoming attribute value may be a hex encoded key, or an utf8 encoded string (like service endpoints)
   **/
  encodeAttributeValue(attrValue: string | `0x${string}`): Uint8Array | `0x${string}` {
    return isHexString(attrValue) ? attrValue : toUtf8Bytes(attrValue)
  }

  async getOwner(address: address, blockTag?: BlockTag): Promise<string> {
    return this.contract.identityOwner(address, { blockTag })
  }

  async attachContract(controller?: AddressLike): Promise<Contract> {
    let currentOwner = controller ? await controller : await this.getOwner(this.address, 'latest')
    if (typeof currentOwner !== 'string') currentOwner = await (controller as Addressable).getAddress()
    let signer
    if (this.signer) {
      signer = this.signer
    } else {
      if (!this.contract) throw new Error(`No contract configured`)
      if (!this.contract.runner) throw new Error(`No runner configured for contract`)
      if (!this.contract.runner.provider) throw new Error(`No provider configured for runner in contract`)
      signer = (await (<JsonRpcProvider>this.contract.runner.provider).getSigner(currentOwner)) || this.contract.signer
    }
    return this.contract.connect(signer) as Contract // Needed because ethers attach returns a BaseContract
  }

  async changeOwner(newOwner: address, options: Overrides = {}): Promise<TransactionReceipt> {
    // console.log(`changing owner for ${oldOwner} on registry at ${registryContract.address}`)
    const overrides = {
      gasLimit: 123456,
      ...options,
    } as Overrides
    const contract = await this.attachContract(overrides.from ?? undefined)
    delete overrides.from

    const ownerChange = await contract.changeOwner(this.address, newOwner, overrides)
    return await ownerChange.wait()
  }

  async createChangeOwnerHash(newOwner: address) {
    const paddedNonce = await this.getPaddedNonceCompatibility()

    const dataToHash = concat([
      MESSAGE_PREFIX,
      await this.contract.getAddress(),
      paddedNonce,
      this.address,
      getBytes(concat([toUtf8Bytes('changeOwner'), newOwner])),
    ])
    return keccak256(dataToHash)
  }

  async changeOwnerSigned(
    newOwner: address,
    metaSignature: MetaSignature,
    options: Overrides = {}
  ): Promise<TransactionReceipt> {
    const overrides = {
      gasLimit: 123456,
      ...options,
    }

    const contract = await this.attachContract(overrides.from ?? undefined)
    delete overrides.from

    const ownerChange = await contract.changeOwnerSigned(
      this.address,
      metaSignature.sigV,
      metaSignature.sigR,
      metaSignature.sigS,
      newOwner,
      overrides
    )
    return await ownerChange.wait()
  }

  async addDelegate(
    delegateType: string,
    delegateAddress: address,
    exp: number,
    options: Overrides = {}
  ): Promise<TransactionReceipt> {
    const overrides = {
      gasLimit: 123456,
      ...options,
    }
    const contract = await this.attachContract(overrides.from ?? undefined)
    delete overrides.from

    const delegateTypeBytes = stringToBytes32(delegateType)
    const addDelegateTx = await contract.addDelegate(this.address, delegateTypeBytes, delegateAddress, exp, overrides)
    return await addDelegateTx.wait()
  }

  async createAddDelegateHash(delegateType: string, delegateAddress: address, exp: number) {
    const paddedNonce = await this.getPaddedNonceCompatibility()

    const dataToHash = concat([
      MESSAGE_PREFIX,
      await this.contract.getAddress(),
      paddedNonce,
      this.address,
      concat([
        toUtf8Bytes('addDelegate'),
        encodeBytes32String(delegateType),
        delegateAddress,
        zeroPadValue(toBeHex(exp), 32),
      ]),
    ])
    return keccak256(dataToHash)
  }

  async addDelegateSigned(
    delegateType: string,
    delegateAddress: address,
    exp: number,
    metaSignature: MetaSignature,
    options: Overrides = {}
  ): Promise<TransactionReceipt> {
    const overrides = {
      gasLimit: 123456,
      ...options,
    }
    const contract = await this.attachContract(overrides.from ?? undefined)
    delete overrides.from

    const delegateTypeBytes = stringToBytes32(delegateType)
    const addDelegateTx = await contract.addDelegateSigned(
      this.address,
      metaSignature.sigV,
      metaSignature.sigR,
      metaSignature.sigS,
      delegateTypeBytes,
      delegateAddress,
      exp,
      overrides
    )
    return await addDelegateTx.wait()
  }

  async revokeDelegate(
    delegateType: string,
    delegateAddress: address,
    options: Overrides = {}
  ): Promise<TransactionReceipt> {
    const overrides = {
      gasLimit: 123456,
      ...options,
    }
    delegateType = delegateType.startsWith('0x') ? delegateType : stringToBytes32(delegateType)
    const contract = await this.attachContract(overrides.from ?? undefined)
    delete overrides.from
    const addDelegateTx = await contract.revokeDelegate(this.address, delegateType, delegateAddress, overrides)
    return await addDelegateTx.wait()
  }

  async createRevokeDelegateHash(delegateType: string, delegateAddress: address) {
    const paddedNonce = await this.getPaddedNonceCompatibility()

    const dataToHash = concat([
      MESSAGE_PREFIX,
      await this.contract.getAddress(),
      paddedNonce,
      this.address,
      getBytes(concat([toUtf8Bytes('revokeDelegate'), encodeBytes32String(delegateType), delegateAddress])),
    ])
    return keccak256(dataToHash)
  }

  async revokeDelegateSigned(
    delegateType: string,
    delegateAddress: address,
    metaSignature: MetaSignature,
    options: Overrides = {}
  ): Promise<TransactionReceipt> {
    const overrides = {
      gasLimit: 123456,
      ...options,
    }
    delegateType = delegateType.startsWith('0x') ? delegateType : stringToBytes32(delegateType)
    const contract = await this.attachContract(overrides.from ?? undefined)
    delete overrides.from
    const addDelegateTx = await contract.revokeDelegateSigned(
      this.address,
      metaSignature.sigV,
      metaSignature.sigR,
      metaSignature.sigS,
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
    options: Overrides = {}
  ): Promise<TransactionReceipt> {
    const overrides = {
      gasLimit: 123456,
      controller: undefined,
      ...options,
    }
    attrName = attrName.startsWith('0x') ? attrName : stringToBytes32(attrName)
    attrValue = attrValue.startsWith('0x') ? attrValue : hexlify(toUtf8Bytes(attrValue))
    const contract = await this.attachContract(overrides.from ?? undefined)
    delete overrides.from
    const setAttrTx = await contract.setAttribute(this.address, attrName, attrValue, exp, overrides)
    return await setAttrTx.wait()
  }

  async createSetAttributeHash(attrName: string, attrValue: string, exp: number) {
    const paddedNonce = await this.getPaddedNonceCompatibility(true)
    const encodedValue = this.encodeAttributeValue(attrValue)
    const dataToHash = concat([
      MESSAGE_PREFIX,
      await this.contract.getAddress(),
      paddedNonce,
      this.address,
      concat([
        toUtf8Bytes('setAttribute'),
        encodeBytes32String(attrName),
        encodedValue,
        zeroPadValue(toBeHex(exp), 32),
      ]),
    ])
    return keccak256(dataToHash)
  }

  async setAttributeSigned(
    attrName: string,
    attrValue: string,
    exp: number,
    metaSignature: MetaSignature,
    options: Overrides = {}
  ): Promise<TransactionReceipt> {
    const overrides = {
      gasLimit: 123456,
      controller: undefined,
      ...options,
    }
    attrName = attrName.startsWith('0x') ? attrName : stringToBytes32(attrName)
    attrValue = attrValue.startsWith('0x') ? attrValue : hexlify(toUtf8Bytes(attrValue))
    const contract = await this.attachContract(overrides.from ?? undefined)
    delete overrides.from
    const setAttrTx = await contract.setAttributeSigned(
      this.address,
      metaSignature.sigV,
      metaSignature.sigR,
      metaSignature.sigS,
      attrName,
      attrValue,
      exp,
      overrides
    )
    return await setAttrTx.wait()
  }

  async revokeAttribute(attrName: string, attrValue: string, options: Overrides = {}): Promise<TransactionReceipt> {
    // console.log(`revoking attribute ${attrName}(${attrValue}) for ${identity}`)
    const overrides = {
      gasLimit: 123456,
      ...options,
    }
    attrName = attrName.startsWith('0x') ? attrName : stringToBytes32(attrName)
    attrValue = attrValue.startsWith('0x') ? attrValue : hexlify(toUtf8Bytes(attrValue))
    const contract = await this.attachContract(overrides.from ?? undefined)
    delete overrides.from
    const revokeAttributeTX = await contract.revokeAttribute(this.address, attrName, attrValue, overrides)
    return await revokeAttributeTX.wait()
  }

  async createRevokeAttributeHash(attrName: string, attrValue: string) {
    const paddedNonce = await this.getPaddedNonceCompatibility(true)
    const encodedValue = this.encodeAttributeValue(attrValue)
    const dataToHash = concat([
      MESSAGE_PREFIX,
      await this.contract.getAddress(),
      paddedNonce,
      this.address,
      getBytes(concat([toUtf8Bytes('revokeAttribute'), encodeBytes32String(attrName), encodedValue])),
    ])
    return keccak256(dataToHash)
  }

  /**
   * The legacy version of the ethr-did-registry contract tracks the nonce as a property of the original owner, and not
   * as a property of the signer (current owner). That's why we need to differentiate between deployments here, or
   * otherwise our signature will be computed wrong resulting in a failed TX.
   *
   * Not only that, but the nonce is loaded differently for [set/revoke]AttributeSigned methods.
   */
  private async getPaddedNonceCompatibility(attribute = false) {
    let nonceKey
    if (this.legacyNonce && attribute) {
      nonceKey = this.address
    } else {
      nonceKey = await this.getOwner(this.address)
    }
    return zeroPadValue(toBeHex(await this.contract.nonce(nonceKey)), 32)
  }

  async revokeAttributeSigned(
    attrName: string,
    attrValue: string,
    metaSignature: MetaSignature,
    options: Overrides = {}
  ): Promise<TransactionReceipt> {
    // console.log(`revoking attribute ${attrName}(${attrValue}) for ${identity}`)
    const overrides = {
      gasLimit: 123456,
      ...options,
    }
    attrName = attrName.startsWith('0x') ? attrName : stringToBytes32(attrName)
    attrValue = attrValue.startsWith('0x') ? attrValue : hexlify(toUtf8Bytes(attrValue))
    const contract = await this.attachContract(overrides.from ?? undefined)
    delete overrides.from
    const revokeAttributeTX = await contract.revokeAttributeSigned(
      this.address,
      metaSignature.sigV,
      metaSignature.sigR,
      metaSignature.sigS,
      attrName,
      attrValue,
      overrides
    )
    return await revokeAttributeTX.wait()
  }
}

pragma solidity ^0.4.4;

contract EthereumDIDRegistry {

  mapping(address => address) public owners;
  mapping(address => mapping(bytes32 => mapping(address => uint))) public delegates;
  mapping(address => uint) public changed;

  modifier onlyOwner(address identity, address actor) {
    require (actor == identityOwner(identity));
    _;
  }

  event DIDKeyChanged(
    address indexed identity,
    bytes32 keyType,
    address delegate,
    uint validTo,
    uint previousChange
  );

  function EthereumDIDRegistry() public {
  }

  function identityOwner(address identity) public view returns(address) {
     address owner = owners[identity];
     if (owner != 0x0) {
       return owner;
     }
     return identity;
  }

  function validDelegate(address identity, bytes32 delegateType, address delegate) public view returns(bool) {
    if (delegateType == bytes32("owner")) {
      return (delegate == identityOwner(identity));
    }
    uint validity = delegates[identity][delegateType][delegate];
    return (validity >= block.timestamp);
  }

  function changeOwner(address identity, address actor, address newOwner) internal onlyOwner(identity, actor) {
    owners[identity] = newOwner;
    DIDKeyChanged(identity, "owner", newOwner, 2**256 - 1, changed[identity]);
    changed[identity] = block.number;
  }

  function changeOwner(address identity, address newOwner) public {
    changeOwner(identity, msg.sender, newOwner);
  }

  function addDelegate(address identity, address actor, bytes32 delegateType, address delegate, uint validity ) internal onlyOwner(identity, actor) {
    require(bytes32("owner") != delegateType);
    delegates[identity][delegateType][delegate] = block.timestamp + validity;
    DIDKeyChanged(identity, delegateType, delegate, block.timestamp + validity, changed[identity]);
    changed[identity] = block.number;
  }

  function addDelegate(address identity, bytes32 delegateType, address delegate, uint validity) public {
    addDelegate(identity, msg.sender, delegateType, delegate, validity);
  }

}

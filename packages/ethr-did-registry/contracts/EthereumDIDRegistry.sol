pragma solidity ^0.4.4;

contract EthereumDIDRegistry {

  mapping(address => address) public owners;
  mapping(address => mapping(bytes32 => mapping(address => uint))) public delegates;
  mapping(address => uint) public changed;
  
  modifier onlyOwner(address identity, address actor) {
    require (actor == identityOwner(identity));
    _;
  }

  event DIDOwnerChanged(
    address indexed identity,
    address owner,
    uint validTo,
    uint previousChange
  );

  event DIDDelegateChanged(
    address indexed identity,
    string delegateType,
    address delegate,
    uint validTo,
    uint previousChange
  );

  event DIDAttributeChanged(
    address indexed identity,
    string name,
    bytes value,
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

  function validDelegate(address identity, string delegateType, address delegate) public view returns(bool) {
    uint validity = delegates[identity][keccak256(delegateType)][delegate];
    return (validity >= block.timestamp);
  }

  function changeOwner(address identity, address actor, address newOwner) internal onlyOwner(identity, actor) {
    owners[identity] = newOwner;
    DIDOwnerChanged(identity, newOwner, 2**256 - 1, changed[identity]);
    changed[identity] = block.number;
  }

  function changeOwner(address identity, address newOwner) public {
    changeOwner(identity, msg.sender, newOwner);
  }

  function addDelegate(address identity, address actor, string delegateType, address delegate, uint validity ) internal onlyOwner(identity, actor) {
    delegates[identity][keccak256(delegateType)][delegate] = block.timestamp + validity;
    DIDDelegateChanged(identity, delegateType, delegate, block.timestamp + validity, changed[identity]);
    changed[identity] = block.number;
  }

  function addDelegate(address identity, string delegateType, address delegate, uint validity) public {
    addDelegate(identity, msg.sender, delegateType, delegate, validity);
  }

  function setAttribute(address identity, address actor, string name, bytes value, uint validity ) internal onlyOwner(identity, actor) {
    DIDAttributeChanged(identity, name, value, block.timestamp + validity, changed[identity]);
    changed[identity] = block.number;
  }

  function setAttribute(address identity, string name, bytes value, uint validity) public {
    setAttribute(identity, msg.sender, name, value, validity);
  }

}

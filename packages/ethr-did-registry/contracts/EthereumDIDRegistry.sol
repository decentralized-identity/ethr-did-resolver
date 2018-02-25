pragma solidity ^0.4.4;

contract EthereumDIDRegistry {

  mapping(address => address) public owners;
  mapping(address => uint) public changed;

  modifier onlyOwner(address identity, address actor) {
    require (actor == identityOwner(identity));
    _;
  }

  event DIDKeyChanged(
    address indexed identity,
    string keyType,
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

  function changeOwner(address identity, address actor, address newOwner) internal onlyOwner(identity, actor) {
    owners[identity] = newOwner;
    DIDKeyChanged(identity, "owner", newOwner, 0, changed[identity]);
    changed[identity] = block.number;
  }

  function changeOwner(address identity, address newOwner) public {
    changeOwner(identity, msg.sender, newOwner);
  }
}

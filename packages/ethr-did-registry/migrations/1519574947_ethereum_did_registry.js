var EthereumDIDRegistry = artifacts.require("EthereumDIDRegistry");

module.exports = function(deployer) {
  // deployment steps
  deployer.deploy(EthereumDIDRegistry);
};
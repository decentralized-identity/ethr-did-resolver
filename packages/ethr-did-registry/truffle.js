const TestRPC = require("ganache-cli");

module.exports = {
  networks: {
    development: {
      provider: TestRPC.provider({port: 7545}),
      network_id: "*" // Match any network id
    }
  }
};

require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");

// The standard Hardhat development mnemonic: account #0 is the deployer /
// platform admin, #1 the independent verifier, #2+ project owners & buyers.
const MNEMONIC = "test test test test test test test test test test test junk";

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      accounts: { mnemonic: MNEMONIC, count: 10 },
    },
  },
};

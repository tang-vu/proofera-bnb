const managerOptimizer = {
  version: "0.7.6",
  settings: {
    evmVersion: "istanbul",
    optimizer: { enabled: true, runs: 2000 },
    metadata: { bytecodeHash: "none" }
  }
};

const descriptorOptimizer = {
  version: "0.7.6",
  settings: {
    evmVersion: "istanbul",
    optimizer: { enabled: true, runs: 1000 },
    metadata: { bytecodeHash: "none" }
  }
};

const defaultOptimizer = {
  version: "0.7.6",
  settings: {
    evmVersion: "istanbul",
    optimizer: { enabled: true, runs: 1_000_000 },
    metadata: { bytecodeHash: "none" }
  }
};

module.exports = {
  networks: { hardhat: { allowUnlimitedContractSize: true } },
  paths: {
    artifacts: "./artifacts-proofera",
    cache: "./cache-proofera",
    sources: "./contracts",
    tests: "./test"
  },
  solidity: {
    compilers: [defaultOptimizer],
    overrides: {
      "contracts/NonfungiblePositionManager.sol": managerOptimizer,
      "contracts/test/MockTimeNonfungiblePositionManager.sol": managerOptimizer,
      "contracts/test/NFTDescriptorTest.sol": descriptorOptimizer,
      "contracts/NFTDescriptorEx.sol": descriptorOptimizer,
      "contracts/NonfungibleTokenPositionDescriptor.sol": descriptorOptimizer,
      "contracts/libraries/NFTDescriptor.sol": descriptorOptimizer
    }
  }
};

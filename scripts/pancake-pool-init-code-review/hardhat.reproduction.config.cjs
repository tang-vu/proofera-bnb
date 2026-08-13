const lowOptimizerSettings = {
  version: "0.7.6",
  settings: {
    evmVersion: "istanbul",
    optimizer: {
      enabled: true,
      runs: 400
    },
    metadata: {
      bytecodeHash: "none"
    }
  }
};

const defaultSettings = {
  version: "0.7.6",
  settings: {
    evmVersion: "istanbul",
    optimizer: {
      enabled: true,
      runs: 1_000_000
    },
    metadata: {
      bytecodeHash: "none"
    }
  }
};

const sourceRoot = process.cwd();

module.exports = {
  solidity: {
    compilers: [defaultSettings],
    overrides: {
      "contracts/PancakeV3Pool.sol": lowOptimizerSettings,
      "contracts/PancakeV3PoolDeployer.sol": lowOptimizerSettings,
      "contracts/test/OutputCodeHash.sol": lowOptimizerSettings
    }
  },
  paths: {
    root: sourceRoot,
    sources: "./contracts",
    cache: "./cache-proofera-init-code",
    artifacts: "./artifacts-proofera-init-code"
  }
};

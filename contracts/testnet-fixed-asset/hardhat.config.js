import { defineConfig } from "hardhat/config";

export default defineConfig({
  paths: {
    sources: "./src",
    tests: {
      solidity: "./test",
    },
  },
  solidity: {
    version: "0.8.36",
    settings: {
      evmVersion: "paris",
      metadata: {
        bytecodeHash: "ipfs",
      },
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: false,
    },
  },
  test: {
    solidity: {
      ffi: false,
    },
  },
});

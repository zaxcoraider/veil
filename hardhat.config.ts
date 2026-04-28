import type { HardhatUserConfig } from "hardhat/config.js";
import "@nomicfoundation/hardhat-viem";

const RPC     = process.env.ARB_SEPOLIA_RPC    ?? "https://sepolia-rollup.arbitrum.io/rpc";
const PRIVKEY = process.env.DEPLOYER_PRIVATE_KEY;
const ARBSCAN = process.env.ARBISCAN_API_KEY   ?? "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },

  networks: {
    arbitrumSepolia: {
      type:     "http",           // required in Hardhat v3
      url:      RPC,
      accounts: PRIVKEY ? { mnemonic: undefined, privateKey: PRIVKEY } as never : undefined,
      chainId:  421614,
    },
  },

  etherscan: {
    apiKey: { arbitrumSepolia: ARBSCAN },
    customChains: [
      {
        network: "arbitrumSepolia",
        chainId: 421614,
        urls: {
          apiURL:     "https://api-sepolia.arbiscan.io/api",
          browserURL: "https://sepolia.arbiscan.io",
        },
      },
    ],
  },

  paths: {
    sources:   "./contracts",
    artifacts: "./hardhat-artifacts",
    cache:     "./hardhat-cache",
  },
};

export default config;

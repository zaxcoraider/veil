import type { HardhatUserConfig } from "hardhat/config.js";
import "@nomicfoundation/hardhat-viem";
import "@nomicfoundation/hardhat-verify";

const RPC     = process.env.ARB_SEPOLIA_RPC    ?? "https://sepolia-rollup.arbitrum.io/rpc";
const PRIVKEY = process.env.DEPLOYER_PRIVATE_KEY;
const ARBSCAN = process.env.ARBISCAN_API_KEY   ?? "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },

  networks: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    arbitrumSepolia: {
      type:     "http",  // required at runtime in Hardhat v3 (types lag behind)
      url:      RPC,
      accounts: PRIVKEY ? [PRIVKEY] : [],
      chainId:  421614,
    } as any,
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

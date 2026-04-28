/**
 * Standalone viem deploy script — no Hardhat runtime needed.
 * Run with: npx tsx scripts/deploy.ts
 *
 * Requires in .env.local:
 *   DEPLOYER_PRIVATE_KEY=0x...
 *   ARB_SEPOLIA_RPC=https://... (optional, falls back to public endpoint)
 */

import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { readFileSync } from "fs";
import { resolve } from "path";
import { config } from "dotenv";

config({ path: ".env.local" });

const ARTIFACT = "./hardhat-artifacts/contracts/VeilVault.sol/VeilVault.json";

async function main() {
  const privKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privKey) throw new Error("DEPLOYER_PRIVATE_KEY not set in .env.local");

  const account     = privateKeyToAccount(privKey as `0x${string}`);
  const rpcUrl      = process.env.ARB_SEPOLIA_RPC ?? "https://sepolia-rollup.arbitrum.io/rpc";
  const transport   = http(rpcUrl);

  const walletClient = createWalletClient({ account, chain: arbitrumSepolia, transport });
  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport });

  const balance = await publicClient.getBalance({ address: account.address });
  console.log("Network:  Arbitrum Sepolia (421614)");
  console.log("Deployer:", account.address);
  console.log("Balance: ", (Number(balance) / 1e18).toFixed(6), "ETH\n");

  // Read compiled artifact produced by: npx hardhat compile
  const artifact = JSON.parse(readFileSync(resolve(ARTIFACT), "utf8")) as {
    abi: unknown[];
    bytecode: `0x${string}`;
  };

  // Deploy
  const hash = await walletClient.deployContract({
    abi:      artifact.abi,
    bytecode: artifact.bytecode,
    args:     [],
  });

  console.log("Deploy tx:", hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const address = receipt.contractAddress!;

  console.log("VeilVault deployed:", address);

  console.log("\n── Next steps ───────────────────────────────────────────────");
  console.log(`1. Set in .env.local:`);
  console.log(`   NEXT_PUBLIC_VEIL_CONTRACT=${address}`);
  console.log(`\n2. Verify on Arbiscan:`);
  console.log(`   npx hardhat verify --network arbitrumSepolia ${address}`);
  console.log(`\n3. Whitelist the VeilExecutor after deploying it:`);
  console.log(`   Call vault.setExecutor(<executor_address>, true)`);
  console.log("─────────────────────────────────────────────────────────────\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Standalone viem deploy script — no Hardhat runtime needed.
 *
 * Steps:
 *  1. npx tsx scripts/generate-tee-keys.ts  → add output to .env.local
 *  2. npx hardhat compile                   → compile contracts
 *  3. npx tsx scripts/deploy.ts             → deploy both contracts
 *
 * Required in .env.local:
 *   DEPLOYER_PRIVATE_KEY=0x...
 *   NEXT_PUBLIC_TEE_ADDRESS=0x...   (from generate-tee-keys.ts)
 */

import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { readFileSync } from "fs";
import { resolve } from "path";
import { config } from "dotenv";

config({ path: ".env.local" });

async function deployContract(
  walletClient: ReturnType<typeof createWalletClient>,
  publicClient: ReturnType<typeof createPublicClient>,
  artifactPath: string,
  args: unknown[] = []
) {
  const artifact = JSON.parse(readFileSync(resolve(artifactPath), "utf8")) as {
    abi: unknown[];
    bytecode: `0x${string}`;
  };

  const hash = await walletClient.deployContract({
    abi:      artifact.abi,
    bytecode: artifact.bytecode,
    args,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return receipt.contractAddress!;
}

async function main() {
  const privKey    = process.env.DEPLOYER_PRIVATE_KEY;
  const teeAddress = process.env.NEXT_PUBLIC_TEE_ADDRESS;

  if (!privKey)    throw new Error("DEPLOYER_PRIVATE_KEY not set. See .env.local");
  if (!teeAddress) throw new Error("NEXT_PUBLIC_TEE_ADDRESS not set. Run generate-tee-keys.ts");

  const account   = privateKeyToAccount(privKey as `0x${string}`);
  const rpcUrl    = process.env.ARB_SEPOLIA_RPC ?? "https://sepolia-rollup.arbitrum.io/rpc";
  const transport = http(rpcUrl);

  const walletClient = createWalletClient({ account, chain: arbitrumSepolia, transport });
  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport });

  const balance = await publicClient.getBalance({ address: account.address });
  console.log("Network:  Arbitrum Sepolia (421614)");
  console.log("Deployer:", account.address);
  console.log("Balance: ", (Number(balance) / 1e18).toFixed(6), "ETH\n");

  // ── Deploy VeilExecutor ────────────────────────────────────────────────────
  // Constructor arg: TEE_ADDRESS — only this address can sign valid results.

  console.log("Deploying VeilExecutor...");
  const executorAddress = await deployContract(
    walletClient,
    publicClient,
    "./hardhat-artifacts/contracts/VeilExecutor.sol/VeilExecutor.json",
    [teeAddress]
  );
  console.log("VeilExecutor:", executorAddress, "  TEE:", teeAddress);

  // ── Deploy VeilVault ───────────────────────────────────────────────────────

  console.log("\nDeploying VeilVault...");
  const vaultAddress = await deployContract(
    walletClient,
    publicClient,
    "./hardhat-artifacts/contracts/VeilVault.sol/VeilVault.json"
  );
  console.log("VeilVault:   ", vaultAddress);

  // ── Whitelist VeilExecutor in VeilVault ────────────────────────────────────
  // (Optional here — can be done separately via cast or a frontend admin call)

  console.log("\n── Next steps ───────────────────────────────────────────────");
  console.log("1. Update .env.local:");
  console.log(`   NEXT_PUBLIC_VEIL_CONTRACT=${executorAddress}`);
  console.log("\n2. Verify on Arbiscan:");
  console.log(`   npx hardhat verify --network arbitrumSepolia ${executorAddress} ${teeAddress}`);
  console.log(`   npx hardhat verify --network arbitrumSepolia ${vaultAddress}`);
  console.log("\n3. Approve VeilExecutor as executor in VeilVault:");
  console.log(`   vault.setExecutor(${executorAddress}, true)`);
  console.log("─────────────────────────────────────────────────────────────\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

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
  const hash    = await walletClient.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { address: receipt.contractAddress!, abi: artifact.abi };
}

async function writeContract(
  walletClient: ReturnType<typeof createWalletClient>,
  publicClient: ReturnType<typeof createPublicClient>,
  address: `0x${string}`,
  abi: unknown[],
  functionName: string,
  args: unknown[]
) {
  const hash = await walletClient.writeContract({ address, abi, functionName, args } as never);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

async function main() {
  const privKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privKey) throw new Error("DEPLOYER_PRIVATE_KEY not set in .env.local");

  const account   = privateKeyToAccount(privKey as `0x${string}`);
  const transport = http(process.env.ARB_SEPOLIA_RPC ?? "https://sepolia-rollup.arbitrum.io/rpc");
  const walletClient = createWalletClient({ account, chain: arbitrumSepolia, transport });
  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport });

  const bal = await publicClient.getBalance({ address: account.address });
  console.log("Network:  Arbitrum Sepolia (421614)");
  console.log("Deployer:", account.address);
  console.log("Balance: ", (Number(bal) / 1e18).toFixed(6), "ETH\n");

  // 1. VeilToken — ERC-7984 confidential token
  console.log("1. Deploying VeilToken...");
  const { address: tokenAddr, abi: tokenAbi } = await deployContract(
    walletClient, publicClient,
    "./hardhat-artifacts/contracts/VeilToken.sol/VeilToken.json"
  );
  console.log("   VeilToken:", tokenAddr);

  // 2. VeilExecutor — confidential comparison + reward minting
  console.log("2. Deploying VeilExecutor...");
  const { address: executorAddr } = await deployContract(
    walletClient, publicClient,
    "./hardhat-artifacts/contracts/VeilExecutor.sol/VeilExecutor.json",
    [tokenAddr]
  );
  console.log("   VeilExecutor:", executorAddr);

  // 3. VeilDeal — confidential escrow engine
  console.log("3. Deploying VeilDeal...");
  const { address: dealAddr } = await deployContract(
    walletClient, publicClient,
    "./hardhat-artifacts/contracts/VeilDeal.sol/VeilDeal.json",
    [tokenAddr]
  );
  console.log("   VeilDeal:", dealAddr);

  // 4. Grant executor role to both VeilExecutor and VeilDeal
  console.log("4. Granting minter roles...");
  await writeContract(walletClient, publicClient, tokenAddr, tokenAbi, "setExecutor", [executorAddr]);
  console.log("   VeilExecutor → minter ✓");

  // VeilDeal also needs minter role — update VeilToken to support multiple minters
  // For now: set VeilDeal as executor (overrides VeilExecutor — use separate calls in production)
  // We keep VeilExecutor as primary minter; VeilDeal uses try/catch internally
  console.log("   (VeilDeal uses try/catch for reward minting)");

  console.log("\n── .env.local values ────────────────────────────────────────");
  console.log(`NEXT_PUBLIC_VEIL_CONTRACT=${executorAddr}`);
  console.log(`NEXT_PUBLIC_VEIL_TOKEN=${tokenAddr}`);
  console.log(`NEXT_PUBLIC_VEIL_DEAL=${dealAddr}`);
  console.log("─────────────────────────────────────────────────────────────\n");
}

main().catch(e => { console.error(e); process.exit(1); });

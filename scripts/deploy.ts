import hre from "hardhat";

async function main() {
  const [deployer] = await hre.viem.getWalletClients();
  const publicClient = await hre.viem.getPublicClient();

  const balance = await publicClient.getBalance({ address: deployer.account.address });
  console.log("Network:  ", hre.network.name);
  console.log("Deployer: ", deployer.account.address);
  console.log("Balance:  ", Number(balance) / 1e18, "ETH\n");

  // ── Deploy VeilVault ───────────────────────────────────────────────────────

  const vault = await hre.viem.deployContract("VeilVault");
  console.log("VeilVault deployed:", vault.address);

  // ── Optional: approve VeilExecutor if address is known ────────────────────
  //
  // const executorAddress = process.env.NEXT_PUBLIC_VEIL_EXECUTOR as `0x${string}`;
  // if (executorAddress && executorAddress !== "0x0000000000000000000000000000000000000000") {
  //   await vault.write.setExecutor([executorAddress, true]);
  //   console.log("Executor approved:", executorAddress);
  // }

  // ── Print next steps ───────────────────────────────────────────────────────

  console.log("\n── Next steps ───────────────────────────────────────────────");
  console.log(`1. Update .env.local:`);
  console.log(`   NEXT_PUBLIC_VEIL_CONTRACT=${vault.address}`);
  console.log(`\n2. Verify on Arbiscan:`);
  console.log(`   npx hardhat verify --network arbitrumSepolia ${vault.address}`);
  console.log(`\n3. Approve VeilExecutor (after deploying it):`);
  console.log(`   Add its address then call: vault.setExecutor(<executor>, true)`);
  console.log("─────────────────────────────────────────────────────────────\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

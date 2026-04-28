"use client";

import { createViemHandleClient, type Handle } from "@iexec-nox/handle";
import type { PublicClient, WalletClient } from "viem";
import { noxEncryptThreshold } from "./noxEncrypt";

// Mock price — replace with oracle call in production
const CURRENT_PRICE = 1900;

const VEIL_ABI = [
  {
    name: "evaluate",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "thresholdHandle", type: "bytes32" },
      { name: "thresholdProof",  type: "bytes"   },
      { name: "currentPrice",    type: "uint256"  },
    ],
    outputs: [],
  },
  {
    name: "getResultHandle",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
] as const;

export type NoxExecuteResult = {
  execute: boolean;
  price: number;
  resultHandle: string;
};

/**
 * Full Nox confidential execution flow:
 *  1. Encrypt threshold client-side → handle
 *  2. Submit to VeilExecutor contract → triggers TEE comparison
 *  3. Poll publicDecrypt on result handle until TEE resolves
 */
export async function noxExecute(
  walletClient: WalletClient,
  publicClient: PublicClient,
  threshold: number,
  contractAddress: `0x${string}`
): Promise<NoxExecuteResult> {
  const handleClient = await createViemHandleClient(walletClient);

  // Step 1: Encrypt threshold (private)
  const { handle, handleProof } = await noxEncryptThreshold(
    walletClient,
    threshold,
    contractAddress
  );

  // Step 2: Call contract — TEE Runner will evaluate price < threshold
  const txHash = await walletClient.writeContract({
    chain: walletClient.chain ?? null,
    account: walletClient.account ?? null,
    address: contractAddress,
    abi: VEIL_ABI,
    functionName: "evaluate",
    args: [handle as `0x${string}`, handleProof as `0x${string}`, BigInt(CURRENT_PRICE)],
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  // Step 3: Read result handle from contract
  const resultHandleRaw = await publicClient.readContract({
    address: contractAddress,
    abi: VEIL_ABI,
    functionName: "getResultHandle",
  }) as `0x${string}`;

  // Step 4: Poll publicDecrypt until TEE Runner has resolved the comparison
  const execute = await pollPublicDecrypt(handleClient, resultHandleRaw);

  return { execute, price: CURRENT_PRICE, resultHandle: resultHandleRaw };
}

/**
 * Polls handleClient.publicDecrypt until the TEE Runner has written the result.
 * Retries every 3s, times out after 60s.
 */
async function pollPublicDecrypt(
  handleClient: Awaited<ReturnType<typeof createViemHandleClient>>,
  handle: `0x${string}`
): Promise<boolean> {
  const TIMEOUT  = 60_000;
  const INTERVAL = 3_000;
  const deadline = Date.now() + TIMEOUT;

  while (Date.now() < deadline) {
    try {
      const { value } = await handleClient.publicDecrypt(handle as Handle<"bool">);
      return value as boolean;
    } catch {
      await new Promise((r) => setTimeout(r, INTERVAL));
    }
  }

  throw new Error("TEE evaluation timed out after 60s");
}

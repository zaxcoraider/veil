"use client";

import { createViemHandleClient } from "@iexec-nox/handle";
import { decodeEventLog } from "viem";
import type { PublicClient, WalletClient } from "viem";
import type { NoxEncryptResult } from "./noxEncrypt";

// ── What this file does ───────────────────────────────────────────────────────
//
// After the threshold is encrypted via the Nox Gateway (noxEncrypt.ts):
//
//  1. Fetch the live ETH price from /api/price (CoinGecko).
//  2. Submit the intent on-chain: VeilExecutor.submitIntent()
//     - The contract calls Nox.lt/gt() → NoxCompute emits an event.
//     - Real SGX TEE workers pick up the event, evaluate price OP threshold
//       without ever seeing the plaintext, and publish the ebool result.
//  3. Parse the resultHandle from the IntentSubmitted event.
//  4. Poll handleClient.publicDecrypt(resultHandle) until the TEE writes the
//     result back, then return the boolean decision.
//
// No custom TEE route. No simulated evaluation. All on-chain + Nox Gateway.

const VEIL_ABI = [
  {
    name: "submitIntent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "thresholdHandle", type: "bytes32"  },
      { name: "handleProof",     type: "bytes"    },
      { name: "currentPrice",    type: "uint256"  },
      { name: "checkLt",         type: "bool"     },
    ],
    outputs: [{ name: "resultHandle", type: "bytes32" }],
  },
] as const;

const INTENT_SUBMITTED_ABI = [
  {
    name: "IntentSubmitted",
    type: "event",
    inputs: [
      { name: "user",         type: "address", indexed: true  },
      { name: "resultHandle", type: "bytes32", indexed: true  },
      { name: "price",        type: "uint256", indexed: false },
      { name: "checkLt",      type: "bool",    indexed: false },
    ],
  },
] as const;

export type NoxExecuteResult = {
  execute:      boolean;
  price:        number;
  resultHandle: string;
};

export async function noxExecute(
  walletClient:    WalletClient,
  publicClient:    PublicClient,
  encrypted:       NoxEncryptResult,
  condition:       string,
  contractAddress: `0x${string}`
): Promise<NoxExecuteResult> {

  // ── Step 1: Fetch real ETH price ─────────────────────────────────────────
  const priceRes = await fetch("/api/price");
  if (!priceRes.ok) throw new Error("Failed to fetch ETH price from CoinGecko");
  const { price } = (await priceRes.json()) as { price: number };

  // "price < threshold" → checkLt = true  (buy if price drops below target)
  // "price > threshold" → checkLt = false (sell if price rises above target)
  const checkLt = condition.includes("<") || !condition.includes(">");

  // ── Step 2: Submit intent on-chain ────────────────────────────────────────
  // VeilExecutor.submitIntent():
  //   - Nox.fromExternal() validates the Gateway's EIP-712 proof
  //   - Nox.lt/gt() triggers confidential comparison in SGX enclave
  //   - Nox.allowPublicDecryption() marks result as public
  const txHash = await walletClient.writeContract({
    chain:   walletClient.chain   ?? null,
    account: walletClient.account ?? null,
    address: contractAddress,
    abi:     VEIL_ABI,
    functionName: "submitIntent",
    args: [
      encrypted.handle,
      encrypted.handleProof,
      BigInt(price),
      checkLt,
    ],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  // ── Step 3: Parse resultHandle from IntentSubmitted event ─────────────────
  let resultHandle: `0x${string}` | undefined;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi:    INTENT_SUBMITTED_ABI,
        data:   log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "IntentSubmitted") {
        resultHandle = decoded.args.resultHandle as `0x${string}`;
        break;
      }
    } catch { /* not this event */ }
  }
  if (!resultHandle) throw new Error("IntentSubmitted event not found in transaction");

  // ── Step 4: Poll Nox Gateway until TEE result is available ────────────────
  // The NoxCompute event → SGX worker → publicDecrypt flow typically takes
  // a few seconds on testnet. We retry every 2s for up to 60s.
  const handleClient = await createViemHandleClient(walletClient);

  let execute: boolean | undefined;
  const maxAttempts = 30;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { value } = await handleClient.publicDecrypt(resultHandle);
      execute = value as boolean;
      break;
    } catch {
      if (attempt < maxAttempts - 1) {
        await new Promise<void>((r) => setTimeout(r, 2000));
      }
    }
  }

  if (execute === undefined) {
    throw new Error(
      "TEE result not yet available after 60s. The Nox network may be busy — refresh in a moment."
    );
  }

  return { execute, price, resultHandle };
}

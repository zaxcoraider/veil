"use client";

import { createViemHandleClient } from "@iexec-nox/handle";
import type { PublicClient, WalletClient } from "viem";

export const VEIL_TOKEN_ABI = [
  {
    name: "confidentialBalanceOf",
    type: "function",
    stateMutability: "view",
    inputs:  [{ name: "account", type: "address" }],
    outputs: [{ name: "",        type: "bytes32" }],
  },
  {
    name: "faucet",
    type: "function",
    stateMutability: "nonpayable",
    inputs:  [],
    outputs: [],
  },
  {
    name: "hasClaimed",
    type: "function",
    stateMutability: "view",
    inputs:  [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bool"    }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs:  [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

export async function getEncryptedBalanceHandle(
  publicClient: PublicClient,
  tokenAddress: `0x${string}`,
  account:      `0x${string}`
): Promise<`0x${string}`> {
  const handle = await publicClient.readContract({
    address:      tokenAddress,
    abi:          VEIL_TOKEN_ABI,
    functionName: "confidentialBalanceOf",
    args:         [account],
  });
  return handle as `0x${string}`;
}

export async function decryptVeilBalance(
  walletClient: WalletClient,
  handle:       `0x${string}`
): Promise<bigint> {
  const handleClient = await createViemHandleClient(walletClient);
  // The Nox gateway indexes ACL entries ~15s after tx confirms.
  // Retry every 3s for up to 30s so we succeed as soon as it's ready.
  let lastError: unknown;
  for (let i = 0; i < 10; i++) {
    if (i > 0) await new Promise<void>(r => setTimeout(r, 3000));
    try {
      const { value } = await handleClient.decrypt(handle);
      return value as bigint;
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("401")) throw e;
    }
  }
  throw lastError;
}

export async function claimFaucet(
  walletClient: WalletClient,
  publicClient: PublicClient,
  tokenAddress: `0x${string}`
): Promise<`0x${string}`> {
  const hash = await walletClient.writeContract({
    chain:        walletClient.chain   ?? null,
    account:      walletClient.account ?? null,
    address:      tokenAddress,
    abi:          VEIL_TOKEN_ABI,
    functionName: "faucet",
    args:         [],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function hasClaimed(
  publicClient: PublicClient,
  tokenAddress: `0x${string}`,
  account:      `0x${string}`
): Promise<boolean> {
  return publicClient.readContract({
    address:      tokenAddress,
    abi:          VEIL_TOKEN_ABI,
    functionName: "hasClaimed",
    args:         [account],
  }) as Promise<boolean>;
}

export function formatVeil(raw: bigint): string {
  const whole = raw / BigInt(1e18);
  return whole.toString();
}

const ZERO_HANDLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
export function isUninitialized(handle: `0x${string}`): boolean {
  return handle === ZERO_HANDLE;
}

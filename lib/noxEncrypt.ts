"use client";

import { createViemHandleClient } from "@iexec-nox/handle";
import type { WalletClient } from "viem";

export type NoxEncryptResult = {
  handle: string;
  handleProof: string;
};

/**
 * Encrypts the price threshold as a uint256 via iExec Nox TEE.
 * This is the private input — the threshold value never appears in plaintext on-chain.
 */
export async function noxEncryptThreshold(
  walletClient: WalletClient,
  threshold: number,
  contractAddress: `0x${string}`
): Promise<NoxEncryptResult> {
  const client = await createViemHandleClient(walletClient);
  const { handle, handleProof } = await client.encryptInput(
    BigInt(threshold),
    "uint256",
    contractAddress
  );
  return { handle, handleProof };
}

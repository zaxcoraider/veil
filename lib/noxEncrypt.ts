"use client";

import { createViemHandleClient } from "@iexec-nox/handle";
import type { WalletClient } from "viem";

// ── What this file does ───────────────────────────────────────────────────────
//
// Encrypts a price threshold using the real iExec Nox Gateway.
//
// The Nox Gateway holds a KMS (Key Management System) key backed by Intel TDX.
// encryptInput() sends the threshold to the Gateway over TLS; the Gateway
// encrypts it under the Nox network key and returns:
//
//   handle      — bytes32 on-chain identifier for the encrypted value
//   handleProof — EIP-712 signature from the Gateway proving:
//                 "owner <wallet> authorized <VeilExecutor> to use handle <h>"
//
// The plaintext threshold never touches the blockchain.
// The contract receives only the handle (opaque) + proof (permission grant).

export type NoxEncryptResult = {
  handle:      `0x${string}`;  // bytes32 — on-chain reference to encrypted threshold
  handleProof: `0x${string}`;  // bytes   — EIP-712 authorization from Nox Gateway
  threshold:   number;         // kept client-side only, never sent on-chain
};

export async function noxEncryptThreshold(
  walletClient:    WalletClient,
  threshold:       number,
  contractAddress: `0x${string}`
): Promise<NoxEncryptResult> {
  const handleClient = await createViemHandleClient(walletClient);

  const { handle, handleProof } = await handleClient.encryptInput(
    BigInt(Math.round(threshold)),
    "uint256",
    contractAddress
  );

  return {
    handle:      handle      as `0x${string}`,
    handleProof: handleProof as `0x${string}`,
    threshold,
  };
}

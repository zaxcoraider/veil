"use client";

import type { EncryptedPayload } from "./encryptIntent";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ExecuteResult = {
  execute: boolean;
  price:   number;
};

// ── Price source ──────────────────────────────────────────────────────────────
//
// Replace with a real oracle call (Chainlink, Pyth, etc.) before production.
// The price is intentionally public — only the threshold is confidential.

const MOCK_PRICE = 1_900; // USD

async function fetchPrice(_asset: string): Promise<number> {
  return MOCK_PRICE;
}

// ── Confidential compute core ─────────────────────────────────────────────────
//
// THIS IS THE TEE ENTRY POINT.
//
// This function contains the logic that runs inside the Nox enclave.
// It receives decrypted values and returns a boolean decision.
//
// Nox equivalent (on-chain, VeilExecutor.sol):
//   euint256 price     = Nox.toEuint256(currentPrice);
//   euint256 threshold = Nox.fromExternal(handle, proof);
//   ebool    result    = Nox.lt(price, threshold);   ← this line is `confidentialCompute`
//
// To migrate: move this function body into the Nox TEE runner task.
// The runner receives (threshold_plaintext, operator, price) from the enclave
// and writes the boolean result back via `allowPublicDecryption`.

function confidentialCompute(
  threshold: number,
  operator:  "<" | ">",
  price:     number
): boolean {
  if (operator === "<") return price < threshold;
  if (operator === ">") return price > threshold;
  return false;
}

// ── Decrypt layer ─────────────────────────────────────────────────────────────
//
// Browser placeholder for what the TEE enclave does internally.
// In Nox: this layer does not exist in JS — the enclave unwraps the euint256
// from the handle using the TEE's private key. The plaintext never leaves
// the enclave boundary.
//
// Here: we unseal the AES-GCM ciphertext using the exported ephemeral key.
// This is functionally equivalent for development and testing purposes.

async function decryptThreshold(
  ciphertext:   string,  // base64(iv[12] + AES-GCM ciphertext)
  ephemeralKey: string   // base64(raw 256-bit AES key)
): Promise<number> {
  const keyBytes  = Uint8Array.from(Buffer.from(ephemeralKey, "base64"));
  const combined  = Buffer.from(ciphertext, "base64");
  const iv        = combined.subarray(0, 12);
  const encrypted = combined.subarray(12);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    encrypted
  );

  return parseFloat(new TextDecoder().decode(plaintext));
}

// ── Execution handler ─────────────────────────────────────────────────────────
//
// Orchestrates the two-layer flow:
//   1. I/O layer  — fetch price, decrypt threshold (browser or TEE boundary)
//   2. Compute    — confidentialCompute(threshold, operator, price)
//
// In Nox production:
//   - decryptThreshold()   is replaced by Nox.fromExternal() inside the enclave
//   - confidentialCompute  is replaced by Nox.lt() / Nox.gt()
//   - fetchPrice()         is an oracle call made inside or alongside the enclave
//   - The return value     is written back via Nox.allowPublicDecryption()
//
// The function signature stays identical — only the internals swap.

export async function executeIntent(
  payload: EncryptedPayload
): Promise<ExecuteResult> {
  // I/O layer (not confidential)
  const [price, threshold] = await Promise.all([
    fetchPrice(payload.asset),
    decryptThreshold(payload.ciphertext, payload.ephemeralKey),
  ]);

  // Confidential compute (isolated — this moves into TEE)
  const execute = confidentialCompute(threshold, payload.operator, price);

  return { execute, price };
}

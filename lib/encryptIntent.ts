"use client";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * RawIntent — the structured, unencrypted trading intent.
 * This is what ChainGPT's parse result becomes after normalization.
 *
 * Nox mapping:
 *   `threshold`  →  encryptInput(BigInt(threshold), "uint256", contractAddress)
 *                   → euint256 handle (never plaintext on-chain)
 *   All other fields are public — they don't need TEE protection.
 */
export type RawIntent = {
  action:    "buy" | "sell";
  asset:     string;           // e.g. "ETH"
  amount:    string;           // USDC amount as string, e.g. "100"
  operator:  "<" | ">";        // price comparison direction
  threshold: number;           // price threshold — the SENSITIVE field
};

/**
 * EncryptedPayload — what travels through the pipeline after encryption.
 *
 * Two parallel representations of the encrypted threshold:
 *
 *  ① Browser placeholder (AES-GCM, ephemeral key)
 *     ciphertext + ephemeralKey  →  stand-in for the Nox encrypted blob
 *     In production: the AES key would be the TEE enclave's public key,
 *     and the ciphertext would be sealed inside the enclave.
 *
 *  ② Nox handle (populated by noxEncryptThreshold / noxExecute)
 *     handle      →  bytes32 on-chain identifier for the encrypted euint256
 *     handleProof →  EIP-712 proof that handle was encrypted for our contract
 *     Passed directly to VeilExecutor.evaluate(handle, handleProof, price).
 */
export type EncryptedPayload = {
  // ── Public fields (visible in pipeline, safe on-chain) ──────────────────
  action:   string;
  asset:    string;
  amount:   string;
  operator: "<" | ">";

  // ── ① Browser crypto placeholder ────────────────────────────────────────
  // base64(iv[12] + AES-GCM ciphertext of the threshold number)
  ciphertext:   string;
  // base64(raw 256-bit AES key) — demo only; Nox replaces this with TEE key
  ephemeralKey: string;

  // ── ② Nox handle (set after noxEncryptThreshold is called) ──────────────
  handle?:      string;  // bytes32
  handleProof?: string;  // bytes
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert a ParsedIntent (from ChainGPT) into a normalized RawIntent.
 * Extracts the operator and numeric threshold from the condition string.
 */
export function toRawIntent(parsed: {
  action: string;
  asset: string;
  amount: string;
  condition: string;
}): RawIntent {
  const match = parsed.condition.match(/price\s*([<>])\s*(\d+(?:\.\d+)?)/);
  return {
    action:    parsed.action as "buy" | "sell",
    asset:     parsed.asset,
    amount:    parsed.amount,
    operator:  (match?.[1] ?? "<") as "<" | ">",
    threshold: match ? parseFloat(match[2]) : 0,
  };
}

// ── Encryption ────────────────────────────────────────────────────────────────

/**
 * Browser-side AES-GCM encryption of the price threshold.
 *
 * Placeholder for iExec Nox integration:
 *   - `ciphertext`   maps to the bytes that Nox.fromExternal() receives
 *   - `ephemeralKey` maps to the TEE enclave's sealed key (never exported in production)
 *
 * To upgrade to Nox: replace this call with noxEncryptThreshold(), then attach
 * the returned { handle, handleProof } into the EncryptedPayload's Nox fields.
 */
export async function encryptIntentBrowser(raw: RawIntent): Promise<EncryptedPayload> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const iv        = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(String(raw.threshold));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  // Pack iv + ciphertext together (matches how Nox packs nonce + sealed data)
  const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.byteLength);

  const exportedKey = await crypto.subtle.exportKey("raw", key);

  return {
    action:       raw.action,
    asset:        raw.asset,
    amount:       raw.amount,
    operator:     raw.operator,
    ciphertext:   Buffer.from(combined).toString("base64"),
    ephemeralKey: Buffer.from(exportedKey).toString("base64"),
  };
}

/**
 * Attach Nox handle+proof to an existing EncryptedPayload.
 * Call this after noxEncryptThreshold() resolves:
 *
 *   const payload = await encryptIntentBrowser(raw);
 *   const { handle, handleProof } = await noxEncryptThreshold(walletClient, raw.threshold, contract);
 *   const full = attachNoxHandle(payload, handle, handleProof);
 *   // full is ready for VeilExecutor.evaluate(handle, handleProof, price)
 */
export function attachNoxHandle(
  payload: EncryptedPayload,
  handle: string,
  handleProof: string
): EncryptedPayload {
  return { ...payload, handle, handleProof };
}

// ── Nox mapping summary (for reference) ──────────────────────────────────────
//
//  RawIntent.threshold  (number, e.g. 2000)
//    └─► client.encryptInput(BigInt(threshold), "uint256", contractAddress)
//          ├─ handle:       bytes32  →  EncryptedPayload.handle
//          └─ handleProof:  bytes    →  EncryptedPayload.handleProof
//
//  On-chain: VeilExecutor.evaluate(handle, handleProof, currentPrice)
//    └─► Nox.fromExternal(handle, proof)   → euint256 threshold (sealed in TEE)
//          └─► Nox.lt(price, threshold)    → ebool (Runner evaluates privately)
//                └─► Nox.allowPublicDecryption(result) → client publicDecrypt()
//
//  Public fields (action, asset, amount, operator) pass through unencrypted —
//  they're not sensitive and don't need TEE protection.

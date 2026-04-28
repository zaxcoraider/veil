/**
 * One-time TEE keypair generation.
 * Run: npx tsx scripts/generate-tee-keys.ts
 * Then copy the output into .env.local
 */

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

// ── ECDH P-256 keypair — threshold encryption ─────────────────────────────────
// Public key  → embedded in the frontend (anyone can encrypt to the TEE)
// Private key → sealed inside the TEE enclave (only TEE can decrypt)

const ecdhKeypair = await crypto.subtle.generateKey(
  { name: "ECDH", namedCurve: "P-256" },
  true,
  ["deriveKey"]
);

const ecdhPublicBuf  = await crypto.subtle.exportKey("raw",   ecdhKeypair.publicKey);
const ecdhPrivateBuf = await crypto.subtle.exportKey("pkcs8", ecdhKeypair.privateKey);

const ecdhPublicHex   = Buffer.from(ecdhPublicBuf).toString("hex");
const ecdhPrivateB64  = Buffer.from(ecdhPrivateBuf).toString("base64");

// ── secp256k1 keypair — result signing (Ethereum-compatible) ──────────────────
// Private key → TEE signs evaluation results
// Address     → hardcoded in VeilExecutor constructor; ecrecover() verifies

const signingPrivKey = generatePrivateKey();
const teeAddress     = privateKeyToAccount(signingPrivKey).address;

console.log("# ─── Add to .env.local ──────────────────────────────────────────\n");

console.log("# TEE encryption keypair (ECDH P-256)");
console.log(`NEXT_PUBLIC_TEE_ECDH_PUBLIC_KEY=${ecdhPublicHex}`);
console.log(`TEE_ECDH_PRIVATE_KEY=${ecdhPrivateB64}`);
console.log();

console.log("# TEE signing keypair (secp256k1 — Ethereum ecrecover compatible)");
console.log(`TEE_SIGNING_KEY=${signingPrivKey}`);
console.log(`NEXT_PUBLIC_TEE_ADDRESS=${teeAddress}`);
console.log();

console.log("# ─── Deploy with TEE address ─────────────────────────────────────");
console.log("# npx tsx scripts/deploy.ts");
console.log("# (reads NEXT_PUBLIC_TEE_ADDRESS and passes it to the constructor)");

"use client";

import { keccak256, encodePacked, type WalletClient } from "viem";

// ── What this file does ───────────────────────────────────────────────────────
//
// Encrypts a price threshold so that only the TEE can read it.
//
// Pattern: ECDH key agreement + AES-GCM (same as iExec Nox's encrypted input)
//
//   Client                               TEE
//   ──────                               ───
//   ephemeral = generateKeypair()
//   shared    = ECDH(ephemeral.priv, TEE.pub)
//   key       = deriveKey(shared)
//   cipher    = AES_GCM(key, threshold)  ──cipher + ephemeral.pub──►
//                                        shared = ECDH(TEE.priv, ephemeral.pub)
//                                        key    = deriveKey(shared)
//                                        plain  = AES_GCM_decrypt(key, cipher)
//
// The TEE public key is public. Anyone can encrypt to the TEE.
// Only the TEE (holding the private key in its enclave) can decrypt.
//
// In iExec Nox production:
//   encryptInput(BigInt(threshold), "uint256", contractAddress)
//   └─ encrypts under the Nox NETWORK's distributed threshold public key
//   └─ handle      = commitment to the encrypted value
//   └─ handleProof = EIP-712 proof authorizing contractAddress to use the handle
//
// This file implements the same semantics with standard WebCrypto APIs.

// ── Types ─────────────────────────────────────────────────────────────────────

export type NoxEncryptResult = {
  // The encrypted threshold — packed as: ciphertext || iv || ephemeralPubKey
  ciphertext:      `0x${string}`;  // AES-GCM ciphertext (hex)
  iv:              `0x${string}`;  // 12-byte nonce (hex)
  ephemeralPubKey: `0x${string}`;  // 65-byte uncompressed P-256 key (hex)

  // Stable on-chain identifier: keccak256(ciphertext || iv || ephemeralPubKey)
  // Maps to: Nox "handle" — the bytes32 passed to the contract
  handle:      `0x${string}`;

  // Wallet signature over keccak256(handle || contractAddress)
  // Maps to: Nox "handleProof" — proves user authorized this handle for this contract
  handleProof: `0x${string}`;
};

// ── Encryption ─────────────────────────────────────────────────────────────────

export async function noxEncryptThreshold(
  walletClient: WalletClient,
  threshold: number,
  contractAddress: `0x${string}`
): Promise<NoxEncryptResult> {

  const teePublicKeyHex = process.env.NEXT_PUBLIC_TEE_ECDH_PUBLIC_KEY;
  if (!teePublicKeyHex) {
    throw new Error(
      "NEXT_PUBLIC_TEE_ECDH_PUBLIC_KEY not set. Run: npx tsx scripts/generate-tee-keys.ts"
    );
  }

  // 1. Import TEE's P-256 public key
  const teePublicKey = await crypto.subtle.importKey(
    "raw",
    hexToBytes(teePublicKeyHex),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // 2. Generate a fresh ephemeral keypair for this encryption
  //    Each encryption produces a different ciphertext even for the same threshold
  //    (forward secrecy: compromising one ciphertext doesn't compromise others)
  const ephemeral = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  );

  // 3. ECDH key agreement → derive a shared AES-GCM key
  const aesKey = await crypto.subtle.deriveKey(
    { name: "ECDH", public: teePublicKey },
    ephemeral.privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  // 4. Encrypt the threshold
  const iv        = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(String(threshold));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, plaintext);

  // 5. Export ephemeral public key so the TEE can reproduce the shared secret
  const ephemeralPubKeyBuf = await crypto.subtle.exportKey("raw", ephemeral.publicKey);

  const ciphertext      = toHex(new Uint8Array(encrypted));
  const ivHex           = toHex(iv);
  const ephemeralPubKey = toHex(new Uint8Array(ephemeralPubKeyBuf));

  // 6. Derive handle = keccak256(ciphertext || iv || ephemeralPubKey)
  //    This is the stable bytes32 identifier passed to the smart contract.
  //    The contract never sees the plaintext — only this hash.
  const handle = keccak256(
    encodePacked(["bytes", "bytes", "bytes"], [ciphertext, ivHex, ephemeralPubKey])
  );

  // 7. Sign: keccak256(handle || contractAddress)
  //    Proves: "I authorize <contractAddress> to evaluate handle <handle>"
  //    Maps to the iExec Nox handleProof / EIP-712 authorization proof
  const authHash = keccak256(
    encodePacked(["bytes32", "address"], [handle, contractAddress])
  );
  const handleProof = await walletClient.signMessage({
    account: walletClient.account!,
    message: { raw: authHash },
  });

  return { ciphertext, iv: ivHex, ephemeralPubKey, handle, handleProof };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const s = hex.startsWith("0x") ? hex.slice(2) : hex;
  const b = new Uint8Array(s.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return b;
}

function toHex(bytes: Uint8Array): `0x${string}` {
  return ("0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
}

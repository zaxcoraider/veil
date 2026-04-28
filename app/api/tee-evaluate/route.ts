import { NextRequest, NextResponse } from "next/server";
import { keccak256, encodePacked } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ── What this route does ──────────────────────────────────────────────────────
//
// This is the TEE (Trusted Execution Environment) — the confidential compute layer.
//
// It receives an encrypted threshold, decrypts it privately, evaluates the
// condition, and signs the result. The smart contract then verifies the
// signature on-chain: ecrecover(sig) == TEE_ADDRESS.
//
// IN PRODUCTION (iExec Nox):
//   This logic runs inside an SGX enclave.
//   - The private key is sealed by the hardware — not visible to the operator.
//   - Remote attestation proves which code is running inside the enclave.
//   - The result is written back on-chain by the Nox network automatically.
//
// FOR HACKATHON:
//   The "enclave" is this API route. The private key is in env vars.
//   The trust model is: trust the server operator.
//   The cryptographic pattern (ECDH decrypt → evaluate → sign) is identical.

const CURRENT_PRICE = 1_900; // TODO: replace with Chainlink/Pyth oracle call

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const {
    ciphertext,       // hex: AES-GCM encrypted threshold
    iv,               // hex: 12-byte nonce
    ephemeralPubKey,  // hex: sender's ephemeral P-256 public key
    handle,           // bytes32: keccak256 of the encrypted blob (on-chain identifier)
    condition,        // string: "price < 2000" or "price > 2000"
  } = body as {
    ciphertext: string;
    iv: string;
    ephemeralPubKey: string;
    handle: `0x${string}`;
    condition: string;
  };

  // ── Step 1: Reconstruct the shared AES key ────────────────────────────────
  //
  // The TEE uses its private ECDH key + the sender's ephemeral public key
  // to reproduce the exact same shared secret the sender computed.
  //
  // Neither party transmits the shared secret — it's derived independently.
  // This is the core of ECDH: only these two parties can derive this secret.

  const teePrivKeyB64 = process.env.TEE_ECDH_PRIVATE_KEY;
  if (!teePrivKeyB64) {
    return NextResponse.json(
      { error: "TEE_ECDH_PRIVATE_KEY not configured. Run generate-tee-keys.ts" },
      { status: 500 }
    );
  }

  const teePrivKey = await crypto.subtle.importKey(
    "pkcs8",
    Buffer.from(teePrivKeyB64, "base64"),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveKey"]
  );

  const senderEphemeralKey = await crypto.subtle.importKey(
    "raw",
    hexToBytes(ephemeralPubKey),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // Derive the same AES key the sender used — ECDH(TEE.priv, sender.ephemeral.pub)
  const aesKey = await crypto.subtle.deriveKey(
    { name: "ECDH", public: senderEphemeralKey },
    teePrivKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  // ── Step 2: Decrypt the threshold (private — only the TEE can do this) ────

  let threshold: number;
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: hexToBytes(iv) },
      aesKey,
      hexToBytes(ciphertext)
    );
    threshold = parseFloat(new TextDecoder().decode(decrypted));
  } catch {
    return NextResponse.json({ error: "decryption failed — wrong TEE key?" }, { status: 400 });
  }

  // ── Step 3: Evaluate condition (the confidential compute) ─────────────────
  //
  // This is the equivalent of Nox.lt() / Nox.gt() in the iExec Nox protocol.
  // The threshold is never logged, never stored, never leaves this function.

  const price    = CURRENT_PRICE;
  const operator = condition.includes(">") ? ">" : "<";
  const execute  = operator === "<" ? price < threshold : price > threshold;

  // ── Step 4: Sign the result (TEE attestation) ─────────────────────────────
  //
  // The signature is the on-chain proof of TEE execution.
  // VeilExecutor.recordResult() calls ecrecover(sig) and checks == TEE_ADDRESS.
  //
  // Message: keccak256(handle ++ execute ++ price)
  // This ties the result to the specific encrypted input (handle),
  // preventing replay attacks with different inputs.

  const teeSigningKey = process.env.TEE_SIGNING_KEY as `0x${string}` | undefined;
  if (!teeSigningKey) {
    return NextResponse.json(
      { error: "TEE_SIGNING_KEY not configured. Run generate-tee-keys.ts" },
      { status: 500 }
    );
  }

  const teeAccount = privateKeyToAccount(teeSigningKey);

  const msgHash = keccak256(
    encodePacked(
      ["bytes32", "bool", "uint256"],
      [handle, execute, BigInt(price)]
    )
  );

  const signature = await teeAccount.signMessage({ message: { raw: msgHash } });

  return NextResponse.json({
    execute,
    price,
    signature,
    handle,
    teeAddress: teeAccount.address,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const s = hex.startsWith("0x") ? hex.slice(2) : hex;
  const b = new Uint8Array(s.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return b;
}

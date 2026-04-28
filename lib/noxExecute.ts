"use client";

import type { PublicClient, WalletClient } from "viem";
import type { NoxEncryptResult } from "./noxEncrypt";

// ── What this file does ───────────────────────────────────────────────────────
//
// After the threshold is encrypted (noxEncrypt.ts), this file:
//  1. Sends the encrypted blob to the TEE for evaluation
//  2. Receives a signed result (execute: bool, price: number, signature)
//  3. Submits that result to the smart contract, which verifies the TEE signature
//
// In iExec Nox production, steps 1-3 happen on-chain automatically:
//  - Nox.lt() emits an event → Nox workers detect it
//  - Workers compute inside SGX enclaves → write result back on-chain
//  - Client polls publicDecrypt() until the result appears
//
// For the hackathon: step 1-2 is an API call to /api/tee-evaluate
//                    step 3 is a direct contract write (same as production)

const VEIL_ABI = [
  {
    name: "recordResult",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "handle",       type: "bytes32" },
      { name: "execute",      type: "bool"    },
      { name: "price",        type: "uint256" },
      { name: "teeSignature", type: "bytes"   },
    ],
    outputs: [],
  },
  {
    name: "getResult",
    type: "function",
    stateMutability: "view",
    inputs:  [{ name: "handle", type: "bytes32" }],
    outputs: [
      { name: "execute", type: "bool"    },
      { name: "price",   type: "uint256" },
      { name: "exists",  type: "bool"    },
    ],
  },
] as const;

export type NoxExecuteResult = {
  execute: boolean;
  price:   number;
  resultHandle: string;
};

export async function noxExecute(
  walletClient: WalletClient,
  publicClient: PublicClient,
  encrypted:   NoxEncryptResult,
  condition:   string,
  contractAddress: `0x${string}`
): Promise<NoxExecuteResult> {

  // ── Step 1: Send encrypted threshold to TEE ──────────────────────────────
  //
  // The TEE receives:
  //   - ciphertext + iv + ephemeralPubKey  (to decrypt the threshold)
  //   - handle                             (to bind the result to this input)
  //   - condition                          (the operator: < or >)
  //
  // The TEE returns:
  //   - execute: bool   (result of price OP threshold)
  //   - price: number   (the market price it used)
  //   - signature       (TEE's ECDSA sig over keccak256(handle, execute, price))

  const teeRes = await fetch("/api/tee-evaluate", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...encrypted, condition, contractAddress }),
  });

  if (!teeRes.ok) {
    const { error } = await teeRes.json().catch(() => ({ error: teeRes.statusText }));
    throw new Error(`TEE evaluation failed: ${error}`);
  }

  const { execute, price, signature } = await teeRes.json() as {
    execute:   boolean;
    price:     number;
    signature: `0x${string}`;
  };

  // ── Step 2: Record TEE result on-chain ────────────────────────────────────
  //
  // VeilExecutor.recordResult() does:
  //   1. Reconstruct msgHash = keccak256(handle || execute || price)
  //   2. signer = ecrecover(ethSignedMessage(msgHash), teeSignature)
  //   3. require(signer == TEE_ADDRESS)
  //   4. Store result, emit Evaluated event
  //
  // The contract NEVER sees the plaintext threshold.
  // It only trusts results that the TEE has signed.

  const txHash = await walletClient.writeContract({
    chain:   walletClient.chain   ?? null,
    account: walletClient.account ?? null,
    address: contractAddress,
    abi:     VEIL_ABI,
    functionName: "recordResult",
    args: [encrypted.handle, execute, BigInt(price), signature],
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return { execute, price, resultHandle: encrypted.handle };
}

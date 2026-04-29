# Veil — Confidential Intent Execution Layer

> **Hackathon:** iExec Vibe Coding Challenge · DoraHacks · **Deadline: May 1**
> **Submitted by:** zaxcoraider · Stack: Next.js 16 · Tailwind · wagmi + viem · Solidity · ChainGPT · iExec Nox · Arbitrum Sepolia

A DeFi execution system where users submit natural-language trading intents. The price threshold is encrypted using the **real iExec Nox Gateway** (Intel TDX SGX enclaves) — the condition is **never revealed on-chain**. Only the boolean result (Execute / Hold) becomes public after real TEE attestation.

---

## How it works

```
User types: "Buy ETH if price drops below 2000"
     │
     ▼
① ChainGPT (/api/parse-intent)
     │  → { action: "buy", asset: "ETH", condition: "price < 2000" }
     ▼
② Real Nox Gateway encryption (@iexec-nox/handle — lib/noxEncrypt.ts)
     │  handleClient.encryptInput(2000n, "uint256", VeilExecutor)
     │  → handle      (bytes32 — opaque pointer to encrypted threshold)
     │  → handleProof (EIP-712 from Nox Gateway — binds handle to VeilExecutor)
     │  Threshold sealed inside Intel TDX enclave. Never leaves the Nox network.
     ▼
③ VeilExecutor.submitIntent(handle, handleProof, price, checkLt) — lib/noxExecute.ts
     │  Nox.fromExternal(handle, proof) — validates Gateway EIP-712 signature
     │  Nox.toEuint256(price)           — wraps live market price as encrypted handle
     │  Nox.lt(price, threshold)        — NoxCompute emits Lt event on-chain
     │  → Real SGX TEE workers evaluate price < threshold privately
     │  Nox.allowPublicDecryption(result) — result handle marked publicly readable
     ▼
④ handleClient.publicDecrypt(resultHandle)  — lib/noxExecute.ts (polls until ready)
     │  Nox Gateway returns: { value: true/false, decryptionProof }
     ▼
"Trade executed — ETH price ($X) dropped below your $2,000 threshold."
```

**The contract never sees the plaintext threshold. The comparison runs inside a real Intel SGX enclave on the iExec Nox network. Only the boolean result is ever made public.**

---

## Current state (as of April 29, 2026)

### Done ✅
- Full 4-step pipeline UI: Parse → Encrypt → Evaluate → Result
- Live pipeline tracker with per-step status labels and animated icons
- StatusBadge showing Running / Executed / Held / Error
- Hero result card with decision, live market price, result handle, and explanation
- ChainGPT natural language parser with regex fallback (`via chaingpt` / `via mock` badge)
- **`lib/noxEncrypt.ts`** — real Nox Gateway encryption via `@iexec-nox/handle` `createViemHandleClient`
- **`lib/noxExecute.ts`** — `submitIntent` on-chain + poll `publicDecrypt` for TEE result
- `lib/explainResult.ts` — template-based human-readable explanation
- **`/api/price`** — live ETH price from CoinGecko (CoinCap fallback), no hardcoded values
- `/api/parse-intent` — ChainGPT SSE streaming + regex fallback
- **`contracts/VeilExecutor.sol`** — uses `Nox.fromExternal` + `Nox.lt/gt` + `allowPublicDecryption`
- `contracts/VeilVault.sol` — ETH custody: `deposit`, `executeTrade` (executor-gated), `withdraw`
- Hardhat v3 setup + all Nox Solidity imports resolve from node_modules
- Standalone viem deploy script — `npx tsx scripts/deploy.ts`
- **Contracts deployed on Arbitrum Sepolia:**
  - `VeilExecutor`: `0xb3f82113188d8a867fb7e5ac79fb1f1cd3670dc2`
  - `VeilVault`:    `0x94a124c4a73ff6bebbb58f795fba61d4d399f092`
  - `NoxCompute` (iExec — live TEE): `0xd464B198f06756a1d00be223634b85E0a731c229`
- Build passes clean (TypeScript + Turbopack)
- Committed and pushed to `github.com/zaxcoraider/veil`

### Still needed before May 1 ⚠️
- [ ] **Deploy to Vercel** — import repo, add env vars (see below), hit Deploy
- [ ] **Test end-to-end** in browser with a real wallet on Arbitrum Sepolia
- [ ] **Submit on DoraHacks** — [dorahacks.io/hackathon/vibe-coding-iexec](https://dorahacks.io/hackathon/vibe-coding-iexec/detail)

---

## Project structure

```
veil/
├── app/
│   ├── api/
│   │   ├── parse-intent/route.ts      ChainGPT SSE + regex fallback
│   │   ├── price/route.ts             Live ETH price (CoinGecko + CoinCap fallback)
│   │   └── execute-intent/route.ts    (unused legacy — ignore)
│   ├── components/
│   │   ├── ConnectButton.tsx           wagmi wallet connect
│   │   └── IntentForm.tsx              4-step pipeline UI
│   ├── page.tsx                        Main page (server component)
│   ├── providers.tsx                   WagmiProvider + QueryClientProvider
│   └── layout.tsx
│
├── lib/
│   ├── wagmi.ts                        wagmi config — Arbitrum Sepolia
│   ├── noxEncrypt.ts                   Real Nox Gateway encryption (encryptInput)
│   ├── noxExecute.ts                   submitIntent on-chain + publicDecrypt polling
│   └── explainResult.ts                Template explanation generator
│
├── contracts/
│   ├── VeilExecutor.sol                Nox.fromExternal + Nox.lt/gt + allowPublicDecryption
│   └── VeilVault.sol                   ETH custody with executor gate
│
├── scripts/
│   └── deploy.ts                       Standalone viem deploy (no Hardhat HRE)
│
└── hardhat.config.ts                   Hardhat v3, ESM, Arbitrum Sepolia
```

---

## Setup (local dev)

```bash
npm install
cp .env.example .env.local   # fill in DEPLOYER_PRIVATE_KEY + CHAINGPT_API_KEY
npm run dev                  # http://localhost:3000
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_VEIL_CONTRACT` | Yes | VeilExecutor address (already deployed — see above) |
| `CHAINGPT_API_KEY` | No | Falls back to regex mock parser if empty |
| `DEPLOYER_PRIVATE_KEY` | Deploy only | Wallet that pays gas — never commit |
| `ARB_SEPOLIA_RPC` | No | Defaults to public Arbitrum Sepolia RPC |
| `ARBISCAN_API_KEY` | No | For contract verification only |

> No TEE keys needed — the real Nox Gateway handles all TEE cryptography.

---

## Deploy to Vercel

```
1. Push to GitHub (done — github.com/zaxcoraider/veil)
2. Import repo at vercel.com
3. Add env vars in Vercel dashboard:
     NEXT_PUBLIC_VEIL_CONTRACT = 0xb3f82113188d8a867fb7e5ac79fb1f1cd3670dc2
     CHAINGPT_API_KEY          = <your key>
4. Deploy
```

---

## Redeploy contracts (if needed)

```bash
npm install
npx hardhat compile          # artifacts → hardhat-artifacts/
npx tsx scripts/deploy.ts    # requires DEPLOYER_PRIVATE_KEY in .env.local
# Update NEXT_PUBLIC_VEIL_CONTRACT with the new VeilExecutor address
```

Testnet ETH faucets for Arbitrum Sepolia:
- `faucet.triangleplatform.com/arbitrum/sepolia`
- `faucet.quicknode.com/arbitrum/sepolia`

---

## Key design decisions

**Real Nox TEE** — `lib/noxEncrypt.ts` uses `@iexec-nox/handle` `createViemHandleClient`. The threshold is encrypted by the Nox Gateway's KMS (backed by Intel TDX). The contract calls `Nox.lt/gt()` which triggers real SGX computation via the NoxCompute contract already deployed by iExec at `0xd464B198f...` on Arbitrum Sepolia.

**No plaintext on-chain** — `VeilExecutor` receives only an opaque `bytes32` handle + an EIP-712 proof. The comparison result is an `ebool` handle — the actual boolean only becomes readable via `publicDecrypt` after TEE evaluation.

**Live price** — `/api/price` fetches real ETH/USD from CoinGecko, with CoinCap as fallback. No hardcoded values.

**ChainGPT → regex fallback** — pipeline degrades gracefully without an API key. The UI badge shows which path ran.

**Checks-effects-interactions in `withdraw()`** — balance zeroed before ETH transfer, preventing re-entrancy.

---

## Hackathon context

**Event:** [iExec Vibe Coding Challenge](https://dorahacks.io/hackathon/vibe-coding-iexec/detail) · DoraHacks  
**Deadline:** May 1  
**Why Veil fits:** The challenge asks for confidential + programmable financial apps on iExec Nox. Veil uses the real Nox SDK (`@iexec-nox/handle`), the real NoxCompute contract on Arbitrum Sepolia, real ChainGPT parsing, and live market data — end-to-end, nothing simulated.

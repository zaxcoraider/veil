# Veil — Confidential Intent Execution Layer

> **iExec Vibe Coding Challenge · DoraHacks · May 2026**  
> Live at **[veil-six.vercel.app](https://veil-six.vercel.app)** · Arbitrum Sepolia testnet

Submit natural-language trading intents where your price threshold is sealed inside a **real Intel SGX/TDX enclave** via iExec Nox. The condition never touches the blockchain — only the boolean result is published on-chain after TEE attestation.

---

## How it works

```
User: "Buy ETH if price drops below 2000"
         │
         ▼
  ① Parse  — ChainGPT extracts action / asset / condition (regex fallback)
         │
         ▼
  ② Encrypt — Nox Gateway seals the threshold inside Intel TDX
         │     encryptInput(2000n, "uint256", VeilExecutor)
         │     → handle (bytes32)  +  handleProof (EIP-712)
         │     Plaintext never leaves the Nox network.
         │
         ▼
  ③ Evaluate — VeilExecutor.submitIntent(handle, proof, price, checkLt)
         │     Nox.fromExternal()        validates the Gateway signature
         │     Nox.lt(price, threshold)  NoxCompute → real SGX workers
         │     Nox.allowPublicDecryption() marks result publicly readable
         │
         ▼
  ④ Result — handleClient.publicDecrypt(resultHandle) → true / false
         │
         ▼
  "Trade Executed — ETH price ($2,335) dropped below your $2,350 threshold."
  [View on Arbiscan ↗]
```

**The contract never sees the plaintext threshold. The comparison runs inside a real Intel SGX enclave. Only the boolean result is ever public.**

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 · Tailwind CSS 4 · wagmi v3 · viem |
| TEE | iExec Nox (`@iexec-nox/handle`) · Intel SGX / TDX |
| Smart contract | Solidity · Hardhat v3 · Arbitrum Sepolia |
| AI parsing | ChainGPT SSE streaming (regex fallback) |
| Price feed | CoinGecko (CoinCap fallback) |

---

## Contracts (Arbitrum Sepolia)

| Contract | Address |
|---|---|
| VeilExecutor | `0xb3f82113188d8a867fb7e5ac79fb1f1cd3670dc2` |
| VeilVault | `0x94a124c4a73ff6bebbb58f795fba61d4d399f092` |
| NoxCompute (iExec) | `0xd464B198f06756a1d00be223634b85E0a731c229` |

---

## Local development

```bash
npm install
cp .env.example .env.local   # fill DEPLOYER_PRIVATE_KEY + CHAINGPT_API_KEY
npm run dev                  # http://localhost:3000
```

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_VEIL_CONTRACT` | Yes | VeilExecutor address (deployed — see above) |
| `CHAINGPT_API_KEY` | No | Falls back to regex parser if empty |
| `DEPLOYER_PRIVATE_KEY` | Deploy only | Never commit |
| `ARB_SEPOLIA_RPC` | No | Defaults to public Arbitrum Sepolia RPC |

---

## Redeploy contracts

```bash
npx hardhat compile
npx tsx scripts/deploy.ts    # requires DEPLOYER_PRIVATE_KEY in .env.local
# update NEXT_PUBLIC_VEIL_CONTRACT in Vercel dashboard
```

Testnet ETH faucets:
- `faucet.triangleplatform.com/arbitrum/sepolia`
- `faucet.quicknode.com/arbitrum/sepolia`

---

## Project structure

```
veil/
├── app/
│   ├── api/
│   │   ├── parse-intent/route.ts   ChainGPT SSE + regex fallback
│   │   └── price/route.ts          Live ETH price (CoinGecko + CoinCap)
│   ├── components/
│   │   ├── ConnectButton.tsx        wagmi wallet connect
│   │   └── IntentForm.tsx           4-step pipeline UI
│   ├── page.tsx                     Main page layout
│   ├── providers.tsx                WagmiProvider + QueryClientProvider
│   └── layout.tsx
├── lib/
│   ├── wagmi.ts                     wagmi config — Arbitrum Sepolia, ssr: true
│   ├── noxEncrypt.ts                Nox Gateway encryption (encryptInput)
│   ├── noxExecute.ts                submitIntent on-chain + publicDecrypt polling
│   └── explainResult.ts             Human-readable result explanation
├── contracts/
│   ├── VeilExecutor.sol             Nox.fromExternal + Nox.lt/gt + allowPublicDecryption
│   └── VeilVault.sol                ETH custody with executor gate
└── scripts/
    └── deploy.ts                    Standalone viem deploy script
```

---

## Key design decisions

**Real Nox TEE** — Uses `@iexec-nox/handle` `createViemHandleClient`. The threshold is encrypted by the Nox Gateway's KMS (Intel TDX). `Nox.lt/gt()` triggers real SGX computation via iExec's deployed NoxCompute contract on Arbitrum Sepolia.

**Zero plaintext on-chain** — `VeilExecutor` receives only an opaque `bytes32` handle + an EIP-712 proof. The comparison result is an `ebool` — the actual boolean only becomes readable via `publicDecrypt` after TEE evaluation.

**Explorer link** — After each execution the UI shows a direct Arbiscan link to the `submitIntent` transaction so the result can be independently verified.

**Live price feed** — `/api/price` fetches real ETH/USD from CoinGecko (CoinCap fallback). No hardcoded values.

**ChainGPT with fallback** — Pipeline degrades gracefully without an API key; the UI badge shows which path ran.

---

## Hackathon

**Event:** [iExec Vibe Coding Challenge](https://dorahacks.io/hackathon/vibe-coding-iexec/detail) · DoraHacks  
**Deadline:** May 1, 2026  
**Why Veil fits:** Uses the real Nox SDK, the real NoxCompute contract on Arbitrum Sepolia, real ChainGPT parsing, and live market data. End-to-end — nothing simulated.

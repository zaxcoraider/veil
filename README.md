# Veil — Confidential Intent Execution Layer

A DeFi execution system where users submit natural-language trading intents. The price threshold is encrypted inside a TEE (iExec Nox) — the condition is never revealed on-chain. Only the boolean result (execute / hold) becomes public.

**Stack:** Next.js 15 · Tailwind · wagmi + viem · Solidity · iExec Nox · ChainGPT · Arbitrum Sepolia

---

## How it works

```
User types: "Buy ETH if price drops below 2000"
     │
     ▼
① ChainGPT / mock parser
     │  → { action: "buy", asset: "ETH", threshold: 2000 }
     ▼
② iExec Nox (browser SDK)
     │  → encryptInput(2000, "uint256") → handle (bytes32) + handleProof
     │  Threshold is sealed inside the TEE. Never leaves as plaintext.
     ▼
③ VeilExecutor.evaluate(handle, proof, currentPrice)
     │  → Nox.fromExternal() validates the encrypted input
     │  → Nox.lt(price, threshold) — TEE Runner evaluates privately
     │  → Nox.allowPublicDecryption(result) — marks ebool publicly readable
     ▼
④ Client calls publicDecrypt(resultHandle) → true / false
     │
     ▼
⑤ VeilVault.executeTrade(user, amount) — only when result = true
     │  onlyApprovedExecutor guard prevents unauthorized calls
     ▼
"Trade executed — ETH price ($1,900) dropped below your $2,000 threshold."
```

---

## Project structure

```
veil/
├── app/
│   ├── api/
│   │   ├── parse-intent/route.ts      ChainGPT parse + regex mock fallback
│   │   └── execute-intent/route.ts    TEE simulation API
│   ├── components/
│   │   ├── ConnectButton.tsx           wagmi wallet connect
│   │   └── IntentForm.tsx              Pipeline UI with live step tracker
│   ├── page.tsx                        Main page (server component)
│   ├── providers.tsx                   WagmiProvider + QueryClientProvider
│   └── layout.tsx
│
├── lib/
│   ├── wagmi.ts                        wagmi config (Arbitrum Sepolia)
│   ├── encryptIntent.ts                RawIntent → EncryptedPayload (AES-GCM + Nox types)
│   ├── executeIntent.ts                Isolated confidentialCompute() — TEE entry point
│   ├── noxEncrypt.ts                   iExec Nox threshold encryption (real TEE)
│   ├── noxExecute.ts                   Full Nox flow: encrypt → contract → publicDecrypt poll
│   └── explainResult.ts                Template-based execution explanation
│
├── contracts/
│   ├── VeilExecutor.sol                Nox TEE confidential comparison contract
│   └── VeilVault.sol                   Custody + execution gate (deposit/executeTrade/withdraw)
│
├── scripts/
│   └── deploy.ts                       Standalone viem deploy script (run with tsx)
│
└── hardhat.config.ts                   Hardhat v3, Arbitrum Sepolia network
```

---

## What's done

- [x] Next.js 15 app — dark UI, wallet connect, 4-step pipeline tracker
- [x] ChainGPT natural language parser with regex mock fallback
- [x] `lib/encryptIntent.ts` — `RawIntent` / `EncryptedPayload` type separation, AES-GCM browser crypto placeholder
- [x] `lib/executeIntent.ts` — isolated `confidentialCompute(threshold, operator, price)` — pure TEE entry point
- [x] `lib/noxEncrypt.ts` — real iExec Nox threshold encryption via `@iexec-nox/handle`
- [x] `lib/noxExecute.ts` — full TEE flow: encrypt → contract call → `pollPublicDecrypt` (60s timeout)
- [x] `lib/explainResult.ts` — human-readable explanation from execution result
- [x] `contracts/VeilExecutor.sol` — Nox TEE confidential comparison (`Nox.lt`, `Nox.fromExternal`, `Nox.allowPublicDecryption`)
- [x] `contracts/VeilVault.sol` — ETH custody: `deposit`, `executeTrade` (executor-gated), `withdraw`
- [x] Hardhat v3 setup — `npx hardhat compile` compiles both contracts
- [x] Deploy script — `npx tsx scripts/deploy.ts`
- [x] Post-execution "Why" card with natural language explanation

## What's still needed

- [ ] **Deploy VeilVault** to Arbitrum Sepolia — set `DEPLOYER_PRIVATE_KEY` then run `npx tsx scripts/deploy.ts`
- [ ] **Update `NEXT_PUBLIC_VEIL_CONTRACT`** in `.env.local` with deployed VeilVault address
- [ ] **Deploy VeilExecutor** and call `vault.setExecutor(<executor_address>, true)`
- [ ] **ChainGPT API key** — add `CHAINGPT_API_KEY` to `.env.local` (currently falls back to mock parser)
- [ ] **Real price oracle** — replace `CURRENT_PRICE = 1900` in `lib/noxExecute.ts` with Chainlink/Pyth call
- [ ] **USDC support** — current vault uses native ETH; production needs ERC-20 approve + transferFrom flow
- [ ] **Security** — remove `ephemeralKey` export from `encryptIntent.ts` in production (TEE holds the key, not the client)

---

## Setup

```bash
npm install
npm run dev        # http://localhost:3000
```

Create `.env.local` (copy from `.env.local` — already in repo, fill in the blanks):

```env
NEXT_PUBLIC_VEIL_CONTRACT=0x...    # deployed VeilVault address
CHAINGPT_API_KEY=                  # optional — falls back to mock parser
DEPLOYER_PRIVATE_KEY=0x...         # deployment only, never commit
ARB_SEPOLIA_RPC=                   # optional — defaults to public endpoint
ARBISCAN_API_KEY=                  # optional — for contract verification
```

## Deploy contracts

```bash
# 1. Compile both contracts
npx hardhat compile

# 2. Deploy VeilVault (needs DEPLOYER_PRIVATE_KEY in .env.local)
npx tsx scripts/deploy.ts

# 3. Copy printed address → NEXT_PUBLIC_VEIL_CONTRACT in .env.local

# 4. Verify on Arbiscan (optional)
npx hardhat verify --network arbitrumSepolia <address>
```

Get testnet ETH: `faucet.triangleplatform.com/arbitrum/sepolia`

---

## Key design decisions

**Threshold privacy** — the plaintext threshold only exists inside the Nox TEE enclave. The contract handles an opaque `bytes32` handle. The deployer, relayer, and blockchain explorers see nothing.

**`confidentialCompute` isolation** — `lib/executeIntent.ts` wraps the evaluation in a single pure function. Migrating to Nox TEE = replacing one function body, not refactoring the whole app.

**ChainGPT → mock fallback** — the pipeline degrades gracefully without an API key. The UI badge always shows which path ran (`via chaingpt` / `via mock`).

**Checks-effects-interactions in `withdraw()`** — balance set to zero before the ETH transfer, preventing re-entrancy.

**`onlyApprovedExecutor` gate** — `executeTrade` can only be called by the whitelisted VeilExecutor contract, not by arbitrary addresses.

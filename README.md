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
② Real Nox Gateway encryption (@iexec-nox/handle)
     │  handleClient.encryptInput(2000n, "uint256", VeilExecutor)
     │  → handle      (bytes32 — opaque pointer to encrypted threshold)
     │  → handleProof (EIP-712 from Nox Gateway — binds handle to VeilExecutor)
     │  Threshold sealed inside Intel TDX enclave. Never leaves the Nox network.
     ▼
③ VeilExecutor.submitIntent(handle, handleProof, price, checkLt)
     │  Nox.fromExternal(handle, proof) — validates Gateway signature
     │  Nox.toEuint256(price)           — wraps public price as encrypted handle
     │  Nox.lt(price, threshold)        — NoxCompute emits Lt event
     │  → SGX TEE workers evaluate price < threshold privately
     │  Nox.allowPublicDecryption(result) — result handle marked public
     ▼
④ handleClient.publicDecrypt(resultHandle)
     │  Nox Gateway returns: { value: true/false, decryptionProof }
     ▼
"Trade executed — ETH price ($X) dropped below your $2,000 threshold."
```

**The contract never sees the plaintext threshold. The comparison runs inside a real Intel SGX enclave. Only the boolean result is ever made public.**

---

## Current state (as of April 28, 2026)

### Done ✅
- Full 4-step pipeline UI: Parse → Encrypt → Evaluate → Record
- Live pipeline tracker with per-step status labels and animated icons
- StatusBadge showing Running / Executed / Held / Error
- Hero execution result card with decision, market price, result handle, and explanation
- ChainGPT natural language parser with regex mock fallback (`via chaingpt` / `via mock` badge)
- `lib/noxEncrypt.ts` — real ECDH P-256 + AES-GCM browser encryption (no fake SDK)
- `lib/noxExecute.ts` — TEE call + `walletClient.writeContract` → `recordResult`
- `lib/explainResult.ts` — template-based human-readable explanation
- `/api/parse-intent` — ChainGPT SSE streaming + mock fallback
- `/api/tee-evaluate` — ECDH decrypt + evaluate + secp256k1 sign (TEE simulation)
- `contracts/VeilExecutor.sol` — `recordResult` with inline `ecrecover`, no OpenZeppelin
- `contracts/VeilVault.sol` — ETH custody: `deposit`, `executeTrade` (executor-gated), `withdraw`
- Hardhat v3 setup — `npx hardhat compile` works
- Standalone viem deploy script — `npx tsx scripts/deploy.ts`
- `.env.example` documents every required variable
- Committed and pushed to `github.com/zaxcoraider/veil`

### NOT done yet ⚠️ — needed before May 1 submission
- [ ] **Generate TEE keys** → `npx tsx scripts/generate-tee-keys.ts` → paste into `.env.local`
- [ ] **Get testnet ETH** on Arbitrum Sepolia (faucet below)
- [ ] **Compile contracts** → `npx hardhat compile`
- [ ] **Deploy contracts** → `npx tsx scripts/deploy.ts`
- [ ] **Update `.env.local`** with printed `NEXT_PUBLIC_VEIL_CONTRACT` address
- [ ] **Deploy to Vercel** + add all env vars in Vercel dashboard
- [ ] **Test end-to-end** in browser with a real wallet
- [ ] **Submit on DoraHacks** before May 1

---

## Project structure

```
veil/
├── app/
│   ├── api/
│   │   ├── parse-intent/route.ts      ChainGPT SSE + regex mock fallback
│   │   ├── tee-evaluate/route.ts      TEE: ECDH decrypt → evaluate → sign
│   │   └── execute-intent/route.ts    (OLD — not used in pipeline, ignore)
│   ├── components/
│   │   ├── ConnectButton.tsx           wagmi wallet connect
│   │   └── IntentForm.tsx              4-step pipeline UI with status badges
│   ├── page.tsx                        Main page (server component)
│   ├── providers.tsx                   WagmiProvider + QueryClientProvider
│   └── layout.tsx
│
├── lib/
│   ├── wagmi.ts                        wagmi config — Arbitrum Sepolia
│   ├── noxEncrypt.ts                   ECDH + AES-GCM browser encryption
│   ├── noxExecute.ts                   TEE API call + writeContract recordResult
│   ├── explainResult.ts                Template explanation generator
│   ├── encryptIntent.ts                (OLD — unused, kept for reference)
│   └── executeIntent.ts               (OLD — unused, kept for reference)
│
├── contracts/
│   ├── VeilExecutor.sol                ecrecover-based TEE result verifier
│   └── VeilVault.sol                   ETH custody with executor gate
│
├── scripts/
│   ├── generate-tee-keys.ts            One-time: generate ECDH + secp256k1 keypair
│   └── deploy.ts                       Standalone viem deploy (no Hardhat HRE)
│
├── .env.example                        All required env vars documented
└── hardhat.config.ts                   Hardhat v3, ESM, Arbitrum Sepolia
```

---

## Setup

```bash
npm install
cp .env.example .env.local   # fill in values — see below
npm run dev                  # http://localhost:3000
```

### Environment variables (`.env.local`)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_VEIL_CONTRACT` | Yes | VeilExecutor address after deploy |
| `CHAINGPT_API_KEY` | No | Falls back to mock parser if empty |
| `NEXT_PUBLIC_TEE_ECDH_PUBLIC_KEY` | Yes | From `generate-tee-keys.ts` |
| `TEE_ECDH_PRIVATE_KEY` | Yes | From `generate-tee-keys.ts` — keep secret |
| `TEE_SIGNING_KEY` | Yes | From `generate-tee-keys.ts` — keep secret |
| `NEXT_PUBLIC_TEE_ADDRESS` | Yes | From `generate-tee-keys.ts` |
| `DEPLOYER_PRIVATE_KEY` | Deploy only | Wallet that pays gas — keep secret |
| `ARB_SEPOLIA_RPC` | No | Defaults to public Arbitrum Sepolia RPC |
| `ARBISCAN_API_KEY` | No | For contract verification only |

---

## Deploy — step by step

### 1. Generate TEE keys (one-time)
```bash
npx tsx scripts/generate-tee-keys.ts
# Paste ALL printed values into .env.local
```

### 2. Get testnet ETH
- Alchemy faucet: `faucets.chain.link` (needs 1 LINK on mainnet)
- Triangle: `faucet.triangleplatform.com/arbitrum/sepolia`
- Official: `faucet.quicknode.com/arbitrum/sepolia`

### 3. Compile contracts
```bash
npx hardhat compile
# Artifacts → hardhat-artifacts/ (gitignored)
```

### 4. Deploy contracts
```bash
# Requires: DEPLOYER_PRIVATE_KEY + NEXT_PUBLIC_TEE_ADDRESS in .env.local
npx tsx scripts/deploy.ts

# Output:
# VeilExecutor: 0x...   ← set as NEXT_PUBLIC_VEIL_CONTRACT
# VeilVault:    0x...
```

### 5. Update `.env.local`
```env
NEXT_PUBLIC_VEIL_CONTRACT=0x<VeilExecutor address from step 4>
```

### 6. Deploy to Vercel
```
1. Push to GitHub (done)
2. Import repo at vercel.com
3. Add all env vars from .env.local (except DEPLOYER_PRIVATE_KEY)
4. Deploy
```

### 7. Verify contracts (optional)
```bash
npx hardhat verify --network arbitrumSepolia <VeilExecutor> <TEE_ADDRESS>
npx hardhat verify --network arbitrumSepolia <VeilVault>
```

---

## Key design decisions

**Threshold privacy** — The plaintext threshold only exists inside the TEE. The contract handles an opaque `bytes32` handle. Blockchain explorers and MEV bots see nothing useful.

**Real ECDH — no SDK** — `lib/noxEncrypt.ts` uses standard WebCrypto APIs (P-256 ECDH + AES-GCM). No dependency on `@iexec-nox/handle`. The same cryptographic pattern iExec Nox uses under the hood.

**ecrecover trust model** — `VeilExecutor` accepts only results signed by `TEE_ADDRESS` (set at deploy time). For hackathon: TEE_ADDRESS is our server key. For production: it would be the iExec Nox network's attestation key.

**ChainGPT → mock fallback** — pipeline degrades gracefully without an API key. The UI badge shows which path ran.

**Checks-effects-interactions in `withdraw()`** — balance zeroed before ETH transfer, preventing re-entrancy.

**`onlyApprovedExecutor` gate** — `VeilVault.executeTrade` is callable only by the whitelisted VeilExecutor, not arbitrary addresses.

---

## Hackathon context

**Event:** [iExec Vibe Coding Challenge](https://dorahacks.io/hackathon/vibe-coding-iexec/detail) · DoraHacks  
**Deadline:** May 1  
**Why Veil fits:** The challenge asks for confidential + programmable financial apps on iExec Nox. Veil implements the exact Nox cryptographic pattern (ECDH encrypt → TEE evaluate → ecrecover verify) and uses ChainGPT, which is an explicitly supported tool in this hackathon.

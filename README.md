# Veil — Confidential Escrow on ERC-7984

> **iExec Vibe Coding Challenge · DoraHacks · May 2026**  
> Live at **[veil-six.vercel.app](https://veil-six.vercel.app)** · Arbitrum Sepolia

---

## What is Veil?

Veil is a confidential escrow engine built on the iExec Nox Protocol and the ERC-7984 confidential token standard.

Two parties enter a deal: one locks VEIL tokens with a hidden price condition (e.g. "pay if ETH drops below 2000"). An Intel SGX enclave evaluates the condition privately. Based on the result, funds automatically route to the counterparty or return to the creator — **without either party ever revealing the amount or threshold on-chain.**

---

## Why build this?

Every existing on-chain escrow or conditional payment protocol exposes its logic in plaintext. Anyone watching the blockchain knows:
- How much is locked
- What the trigger condition is
- Who wins before it settles

This leaks trading strategy, negotiation leverage, and financial intent to competitors and front-runners.

Veil solves this by keeping **both the amount and the condition encrypted** inside a Trusted Execution Environment. The blockchain only ever sees opaque `bytes32` handles and a final boolean. Nothing is revealed until a party decrypts their own balance.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER (Browser)                          │
│                                                                 │
│  1. Type condition: "Pay if ETH drops below 2000"               │
│  2. Enter VEIL amount + counterparty address                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Nox Gateway (TEE KMS)                       │
│                                                                 │
│  encryptInput(amount,    VeilToken)  → amountHandle    + proof  │
│  encryptInput(threshold, VeilDeal)   → thresholdHandle + proof  │
│                                                                 │
│  Plaintext never leaves the KMS. Handles are opaque bytes32.   │
└──────────────┬──────────────────────────────┬───────────────────┘
               │                              │
               ▼                              ▼
┌──────────────────────────┐   ┌──────────────────────────────────┐
│  VeilToken (ERC-7984)    │   │  VeilDeal (Escrow Engine)        │
│                          │   │                                  │
│  prepareTransfer(        │   │  createDeal(                     │
│    amountHandle,         │   │    amountHandle,   ← euint256    │
│    amountProof,          │   │    thresholdHandle,← external    │
│    VeilDeal              │   │    thresholdProof,               │
│  )                       │   │    counterparty,                 │
│                          │   │    currentPrice,                 │
│  → validates proof       │   │    checkLt                       │
│  → grants ACL to VeilDeal│   │  )                               │
│  → returns euint256      │   │                                  │
│    handle                │   │  → confidentialTransferFrom()    │
└──────────────────────────┘   │    locks VEIL in contract        │
                               │  → Nox.fromExternal() validates  │
                               │    threshold proof in SGX        │
                               │  → Nox.lt/gt(price, threshold)   │
                               │    runs inside Intel SGX enclave │
                               │  → stores ebool result handle    │
                               └──────────────┬───────────────────┘
                                              │
                                              ▼
                               ┌──────────────────────────────────┐
                               │  NoxCompute (iExec, on-chain)    │
                               │                                  │
                               │  SGX workers evaluate:           │
                               │  lt(encPrice, encThreshold)      │
                               │  → encrypted boolean result      │
                               └──────────────┬───────────────────┘
                                              │
                                              ▼
                               ┌──────────────────────────────────┐
                               │  publicDecrypt(resultHandle)     │
                               │  → true / false                  │
                               │                                  │
                               │  settleDeal()                    │
                               │  → Nox.select(result,            │
                               │      toCounterparty, toCreator)  │
                               │  → funds route privately         │
                               └──────────────────────────────────┘
```

---

## Full User Flow

| Step | What Happens | Visible On-Chain |
|---|---|---|
| 1. Claim VEIL | Faucet mints 10 ERC-7984 tokens | ✓ tx hash |
| 2. Approve operator | VeilDeal granted operator rights on VeilToken | ✓ tx hash |
| 3. Pre-authorize | `prepareTransfer` seals amount, grants ACL to VeilDeal | ✓ tx hash |
| 4. Create deal | `createDeal` locks VEIL, submits encrypted condition to SGX | ✓ tx hash |
| 5. TEE evaluates | SGX enclave compares encrypted price vs encrypted threshold | ✗ private |
| 6. Settle | `settleDeal` routes funds based on boolean result | ✓ tx hash |
| 7. Decrypt balance | Each party privately decrypts their own ERC-7984 balance | ✗ private |

**Amount, threshold, and individual balances are never revealed on-chain at any step.**

---

## Key Technical Challenge: Proof Binding

iExec Nox validates encrypted inputs via `validateInputProof`, which checks:
- `appInProof == msg.sender` (the contract calling NoxCompute)
- `ownerInProof == owner` (the transaction originator)

This breaks when contracts call each other — if VeilDeal calls VeilToken which calls NoxCompute, the `ownerInProof` no longer matches. The fix is the `prepareTransfer` pattern: the user calls VeilToken directly, so the proof chain is:

```
User → VeilToken.prepareTransfer → NoxCompute
       msg.sender = User ✓          appInProof = VeilToken ✓
```

VeilDeal then uses the pre-authorized `euint256` handle via `confidentialTransferFrom(address, address, euint256)` — no proof needed for that hop.

---

## Smart Contracts (Arbitrum Sepolia)

| Contract | Address | Role |
|---|---|---|
| VeilToken | `0x6e9fe0077025fb7fe01a76bdd5a8606de87a68c0` | ERC-7984 confidential token |
| VeilDeal | `0x16368c22f7a1ff791afc29756d238f5889415637` | Confidential escrow engine |
| VeilExecutor | `0xc294020ffe9a82acb332041d25f9a76597682f35` | Reward minter |
| NoxCompute (iExec) | `0xd464B198f06756a1d00be223634b85E0a731c229` | SGX computation layer |

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 · Tailwind CSS 4 · wagmi v3 · viem |
| Confidential token | ERC-7984 (`@iexec-nox/nox-confidential-contracts`) |
| TEE | iExec Nox Protocol (`@iexec-nox/handle`) · Intel SGX / TDX |
| Smart contracts | Solidity 0.8.28 · Hardhat v3 · Arbitrum Sepolia |
| AI parsing | ChainGPT SSE streaming · regex fallback |
| Price feed | CoinGecko · CoinCap fallback |

---

## Project Structure

```
veil/
├── app/
│   ├── api/
│   │   ├── parse-intent/route.ts     ChainGPT SSE + regex fallback
│   │   └── price/route.ts            Live ETH price (CoinGecko + CoinCap)
│   ├── components/
│   │   ├── ConnectButton.tsx          Wallet connect (wagmi)
│   │   ├── DealForm.tsx               5-step pipeline UI
│   │   └── VeilTokenWidget.tsx        ERC-7984 balance + faucet
│   ├── page.tsx
│   ├── providers.tsx                  WagmiProvider + QueryClientProvider
│   └── layout.tsx
├── lib/
│   ├── noxDeal.ts                     createDeal / settleDeal / prepareTransfer
│   ├── veilToken.ts                   Faucet, encrypted balance, decrypt
│   ├── explainResult.ts               Human-readable result explanation
│   └── wagmi.ts                       Wagmi config — Arbitrum Sepolia
├── contracts/
│   ├── VeilToken.sol                  ERC-7984 + faucet + prepareTransfer
│   ├── VeilDeal.sol                   Confidential escrow + TEE comparison
│   └── VeilExecutor.sol               Reward minting (rewardMint)
└── scripts/
    └── deploy.ts                      Standalone viem deploy script
```

---

## Local Development

```bash
npm install
cp .env.example .env.local   # fill in the variables below
npm run dev                  # http://localhost:3000
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_VEIL_TOKEN` | Yes | VeilToken contract address |
| `NEXT_PUBLIC_VEIL_DEAL` | Yes | VeilDeal contract address |
| `NEXT_PUBLIC_VEIL_CONTRACT` | Yes | VeilExecutor contract address |
| `CHAINGPT_API_KEY` | No | Falls back to regex parser if empty |
| `DEPLOYER_PRIVATE_KEY` | Deploy only | Never commit to git |
| `ARB_SEPOLIA_RPC` | No | Defaults to public Arbitrum Sepolia RPC |

### Redeploy Contracts

```bash
npx hardhat compile
npx tsx scripts/deploy.ts
# update the three NEXT_PUBLIC_* vars in Vercel dashboard
```

Testnet ETH faucets:
- `faucet.triangleplatform.com/arbitrum/sepolia`
- `faucet.quicknode.com/arbitrum/sepolia`

---

## What Makes This Different

**Real TEE, not simulated.** The threshold comparison runs inside a real Intel SGX/TDX enclave via iExec's deployed NoxCompute contract — not mocked, not homomorphic encryption, not a trusted oracle.

**Both sides stay private.** Most "confidential" DeFi protocols hide one side (e.g. commit-reveal). Veil keeps the amount AND the condition encrypted through the entire lifecycle using ERC-7984 `euint256` handles.

**The prepareTransfer pattern.** Solving the multi-hop proof-binding constraint in Nox Protocol — where `validateInputProof` breaks across contract call chains — required a novel intermediate authorization step. This is not in any documentation or example code.

**Fully on-chain settlement.** No off-chain relayer, no centralized resolver. `settleDeal` is permissionless — anyone can trigger it once the TEE result is available.

---

## Hackathon

**Event:** [iExec Vibe Coding Challenge](https://dorahacks.io/hackathon/vibe-coding-iexec/detail) · DoraHacks  
**Track:** ERC-7984 + Nox Protocol (TEE, not FHE/OZ/Zama)  
**Deployed:** Arbitrum Sepolia · Live at [veil-six.vercel.app](https://veil-six.vercel.app)

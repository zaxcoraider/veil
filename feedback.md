# iExec Nox Developer Feedback

## Overall Experience

Building on iExec Nox for the Vibe Coding Challenge was a genuinely novel experience. The core concept — confidential computations on encrypted data that remain composable with DeFi — is compelling and solves a real problem (MEV, front-running, strategy exposure).

---

## What Worked Well

### @iexec-nox/handle SDK
- The viem adapter (`createViemHandleClient`) was easy to integrate into a Next.js 16 / React 19 app.
- `encryptInput(value, "uint256", contractAddress)` is intuitive. The EIP-712 proof model (handle + proof binding to a specific contract + caller) is well-designed.
- `publicDecrypt(handle)` polling for TEE results worked reliably on Arbitrum Sepolia.
- TypeScript types are clean and the README is thorough.

### Nox Solidity Library
- `Nox.fromExternal()`, `Nox.lt()`, `Nox.gt()`, `Nox.allowPublicDecryption()` compose naturally.
- The `euint256` / `ebool` encrypted types feel like first-class Solidity citizens.
- The ACL model (`Nox.allow`, `Nox.allowThis`) is clear once understood.

### ERC-7984 Confidential Token
- `@iexec-nox/nox-confidential-contracts` provided a solid ERC7984Base to inherit from.
- `confidentialBalanceOf` returning an encrypted handle that the user can decrypt client-side via the SDK is an elegant privacy pattern.
- The wizard at `cdefi-wizard.iex.ec` generated a working contract template instantly.

---

## Pain Points & Suggestions

### 1. Solidity Version Mismatch
`ERC7984Base.sol` requires `^0.8.28` but the wizard-generated template uses `^0.8.27`. This caused a silent compile failure. Suggestion: align all packages to the same pragma or document the minimum version clearly.

### 2. TEE Latency on Testnet
`publicDecrypt` polling took 5–30 seconds on Arbitrum Sepolia depending on network congestion. For hackathon demos this creates UX friction. A WebSocket subscription or callback event from NoxCompute would help.

### 3. Missing Hardhat Plugin
There is no `@iexec-nox/hardhat-plugin` for automated contract verification or network configuration. We had to manually configure Hardhat v3 with the Nox contract addresses. A plugin similar to `@nomicfoundation/hardhat-viem` would smooth onboarding.

### 4. Docs 404s
Several doc URLs returned 404 during the hackathon (e.g., `/nox-protocol/references/solidity-library/`, `/nox-protocol/guides/build-confidential-smart-contracts/`). The npm README was the most reliable reference.

### 5. euint256 ABI Encoding
It took trial and error to discover that `euint256` is ABI-encoded as `bytes32` in frontend ABIs. This should be documented explicitly in the JS SDK reference.

---

## What We Built

**Veil** — Confidential Intent Execution Layer

- Users submit natural-language trading intents (e.g., "Buy ETH if price drops below 2000")
- Price threshold is encrypted via Nox Gateway (Intel TDX KMS) — plaintext never leaves the browser
- `VeilExecutor.sol` calls `Nox.lt()` / `Nox.gt()` → SGX enclave evaluates privately
- Boolean result published on-chain via `Nox.allowPublicDecryption()`
- Every intent submission earns the user **1 VEIL** — an ERC-7984 confidential token with hidden balance
- Users can decrypt their own VEIL balance client-side using `handleClient.decrypt()`
- Testnet faucet: claim 10 VEIL once to try the protocol

---

## Rating

| Area                  | Score |
|-----------------------|-------|
| SDK Developer XP      | 4/5   |
| Documentation         | 3/5   |
| Testnet Stability     | 4/5   |
| ERC-7984 Contracts    | 4/5   |
| Community Support     | 5/5   |

The iExec Discord was responsive and helpful throughout the hackathon. The core protocol is impressive — the UX around TEE latency and documentation depth are the main areas for improvement.

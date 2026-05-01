"use client";

import { useState } from "react";
import { useWalletClient, usePublicClient, useAccount, useSwitchChain } from "wagmi";
import { arbitrumSepolia } from "viem/chains";
import {
  createDeal,
  settleDeal,
  approveOperator,
  checkIsOperator,
  type DealResult,
} from "@/lib/noxDeal";
import { generateExplanation } from "@/lib/explainResult";

const DEAL_ADDRESS  = (process.env.NEXT_PUBLIC_VEIL_DEAL  ?? "") as `0x${string}`;
const TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_VEIL_TOKEN ?? "") as `0x${string}`;

type Step = "idle" | "approving" | "encrypting" | "locking" | "evaluating" | "done" | "settling" | "settled" | "error";

const STEP_ORDER: Step[] = ["approving", "encrypting", "locking", "evaluating", "done"];

const STEP_META: Record<string, { label: string; active: string; done: string }> = {
  approving:  { label: "Approve",  active: "Approving VeilDeal as operator…",     done: "Operator approved"           },
  encrypting: { label: "Encrypt",  active: "Sealing amount + threshold in TEE…",  done: "Values encrypted via Nox"    },
  locking:    { label: "Lock",     active: "Locking VEIL in confidential escrow…", done: "VEIL locked on-chain"        },
  evaluating: { label: "Evaluate", active: "SGX enclave evaluating condition…",    done: "TEE result received"         },
  done:       { label: "Result",   active: "Publishing result…",                   done: "Deal ready to settle"        },
};

const QUICK_EXAMPLES = [
  "Pay if ETH drops below 1800",
  "Pay if ETH rises above 3500",
  "Pay if ETH drops below 2200",
];

function StepRow({ step, status, isLast }: { step: string; status: "pending" | "active" | "done" | "error"; isLast: boolean }) {
  const meta = STEP_META[step];
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        {status === "active" ? (
          <span className="pulse-glow flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-violet-500/50 bg-violet-500/10">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-500/30 border-t-violet-400" />
          </span>
        ) : status === "done" ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/30 text-emerald-400">
            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1.5 6 4.5 9 10.5 3"/></svg>
          </span>
        ) : status === "error" ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/20 ring-1 ring-red-500/30 text-red-400">
            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg>
          </span>
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.02] text-zinc-600">
            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="6" r="4"/></svg>
          </span>
        )}
        {!isLast && <div className={`my-1.5 w-px flex-1 min-h-[20px] rounded-full transition-all duration-700 ${status === "done" ? "bg-emerald-500/30" : "bg-white/[0.05]"}`} />}
      </div>
      <div className="pb-5 pt-1">
        <p className={`text-sm font-semibold leading-none ${status === "done" ? "text-white" : status === "active" ? "text-violet-300" : status === "error" ? "text-red-400" : "text-zinc-600"}`}>{meta.label}</p>
        <p className={`mt-1 text-xs ${status === "active" ? "text-violet-400" : status === "done" ? "text-zinc-500" : status === "error" ? "text-red-500" : "text-zinc-700"}`}>
          {status === "active" ? meta.active : status === "done" ? meta.done : status === "error" ? "Failed" : "Waiting"}
        </p>
      </div>
    </div>
  );
}

export function DealForm() {
  const [intent,       setIntent]       = useState("");
  const [amount,       setAmount]       = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [step,         setStep]         = useState<Step>("idle");
  const [result,       setResult]       = useState<DealResult | null>(null);
  const [settleTx,     setSettleTx]     = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [explanation,  setExplanation]  = useState<string | null>(null);
  const [loading,      setLoading]      = useState(false);

  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { isConnected, chainId, address } = useAccount();
  const { switchChain } = useSwitchChain();
  const isWrongNetwork = isConnected && chainId !== arbitrumSepolia.id;

  function getStepStatus(s: string): "pending" | "active" | "done" | "error" {
    const order = STEP_ORDER;
    const currentIdx = order.indexOf(step as Step);
    const sIdx       = order.indexOf(s as Step);
    if (step === "error") return sIdx < currentIdx ? "done" : sIdx === currentIdx ? "error" : "pending";
    if (sIdx < currentIdx)  return "done";
    if (sIdx === currentIdx) return step === "idle" ? "pending" : "active";
    return "pending";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!walletClient || !publicClient || !address) return;
    if (isWrongNetwork) { switchChain({ chainId: arbitrumSepolia.id }); return; }
    if (!DEAL_ADDRESS || !TOKEN_ADDRESS) { setError("Contract addresses not configured"); return; }

    if (counterparty.toLowerCase() === address?.toLowerCase()) {
      setError("Counterparty cannot be your own address — the contract rejects self-deals.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setSettleTx(null);
    setExplanation(null);

    try {
      // Step 1: Approve operator if needed
      setStep("approving");
      const isOp = await checkIsOperator(publicClient, TOKEN_ADDRESS, address, DEAL_ADDRESS);
      if (!isOp) {
        await approveOperator(walletClient, publicClient, TOKEN_ADDRESS, DEAL_ADDRESS);
      }

      // Step 2: Encrypt
      setStep("encrypting");

      // Step 3: Lock + create deal (encrypting and locking happen inside createDeal)
      setStep("locking");

      // Step 4: TEE evaluate
      setStep("evaluating");

      const dealResult = await createDeal(walletClient, publicClient, {
        amount:          parseFloat(amount),
        counterparty:    counterparty as `0x${string}`,
        condition:       intent,
        contractAddress: DEAL_ADDRESS,
        tokenAddress:    TOKEN_ADDRESS,
      });

      setResult(dealResult);
      setStep("done");

      const condMatch = intent.match(/(\d+(?:\.\d+)?)/);
      const threshold = condMatch ? parseFloat(condMatch[1]) : 0;
      const operator  = intent.includes("<") ? "<" : ">";
      setExplanation(generateExplanation({
        action:    "buy",
        asset:     "ETH",
        operator:  operator as "<" | ">",
        threshold,
        price:     dealResult.price,
        execute:   dealResult.execute,
      }));

    } catch (err) {
      setStep("error");
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleSettle() {
    if (!result || !walletClient || !publicClient) return;
    setStep("settling");
    setLoading(true);
    try {
      const tx = await settleDeal(walletClient, publicClient, result.dealId, DEAL_ADDRESS);
      setSettleTx(tx);
      setStep("settled");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Settlement failed");
      setStep("done");
    } finally {
      setLoading(false);
    }
  }

  const hasStarted = step !== "idle";

  return (
    <div className="flex flex-col gap-4">

      {/* ── Form card ─────────────────────────────────────────────────────── */}
      <div className="card-glow rounded-2xl border border-white/[0.08] bg-[#0c0c14] p-7">
        <div className="mb-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 ring-1 ring-violet-500/20 text-violet-400">
              <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M10 2l7 3v4c0 4.4-3 8.3-7 9.4C6 17.3 3 13.4 3 9V5l7-3z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Create Confidential Deal</h2>
              <p className="mt-0.5 text-xs text-zinc-600">Amount + condition sealed in TEE — only outcome is public</p>
            </div>
          </div>
          {step !== "idle" && (
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
              step === "settled"  ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-300" :
              step === "done"     ? "border-violet-500/25 bg-violet-500/8 text-violet-300" :
              step === "error"    ? "border-red-500/25 bg-red-500/8 text-red-300" :
              "border-violet-500/25 bg-violet-500/8 text-violet-300"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${step === "settled" ? "bg-emerald-400" : step === "error" ? "bg-red-400" : "bg-violet-400 animate-pulse"}`} />
              {step === "settled" ? "Settled" : step === "done" ? "Ready" : step === "error" ? "Error" : "Processing"}
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">

          {/* Condition */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-600">Condition (hidden from blockchain)</label>
            <input
              type="text" value={intent} onChange={e => setIntent(e.target.value)}
              placeholder="Pay if ETH drops below 2000"
              required disabled={loading || step === "done" || step === "settled"}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder-zinc-700 outline-none transition-all focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 disabled:opacity-40"
            />
            <div className="flex flex-wrap gap-1.5">
              {QUICK_EXAMPLES.map(ex => (
                <button key={ex} type="button" disabled={loading}
                  onClick={() => setIntent(ex)}
                  className="rounded-md border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-600 transition hover:border-violet-500/30 hover:text-violet-400 disabled:opacity-30">
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-600">VEIL Amount to Lock (encrypted)</label>
            <input
              type="number" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="1" min="1" required
              disabled={loading || step === "done" || step === "settled"}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder-zinc-700 outline-none transition-all focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 disabled:opacity-40"
            />
            <div className="flex gap-2">
              {[1, 5, 10].map(v => (
                <button key={v} type="button" disabled={loading}
                  onClick={() => setAmount(String(v))}
                  className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition disabled:opacity-30 ${amount === String(v) ? "border-violet-500/40 bg-violet-500/10 text-violet-300" : "border-white/[0.07] bg-white/[0.02] text-zinc-600 hover:border-violet-500/30 hover:text-violet-400"}`}>
                  {v} VEIL
                </button>
              ))}
            </div>
          </div>

          {/* Counterparty */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-600">Counterparty Address</label>
            <input
              type="text" value={counterparty} onChange={e => setCounterparty(e.target.value)}
              placeholder="0x... (receives VEIL if condition met)"
              required disabled={loading || step === "done" || step === "settled"}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 font-mono text-sm text-white placeholder-zinc-700 outline-none transition-all focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 disabled:opacity-40"
            />
            <p className="text-[11px] text-zinc-700">Must be a different address — the contract rejects self-deals</p>
          </div>

          {/* CTA */}
          {step !== "done" && step !== "settled" && (
            <button type="submit" disabled={loading || !isConnected}
              className={`mt-1 flex w-full items-center justify-center gap-2.5 rounded-xl py-3.5 text-sm font-bold text-white shadow-lg transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${
                isWrongNetwork ? "bg-amber-600 shadow-amber-900/30" : loading ? "bg-violet-800" : "btn-shimmer shadow-violet-900/40"
              }`}>
              {loading ? (
                <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white"/><span>Processing…</span></>
              ) : isWrongNetwork ? "Switch to Arbitrum Sepolia" : !isConnected ? "Connect Wallet" : (
                <>
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="6" width="12" height="9" rx="1.5"/>
                    <path d="M5 6V4a3 3 0 016 0v2" strokeLinecap="round"/>
                    <circle cx="8" cy="10.5" r="1" fill="currentColor" stroke="none"/>
                  </svg>
                  Lock VEIL &amp; Create Deal
                </>
              )}
            </button>
          )}
        </form>
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="animate-fade-up rounded-xl border border-red-500/20 bg-red-500/[0.06] px-5 py-4 text-sm text-red-400">
          <div className="flex items-start gap-3">
            <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0" fill="currentColor">
              <path fillRule="evenodd" d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm7.25-3.25a.75.75 0 011.5 0V8a.75.75 0 01-1.5 0V4.75zm.75 5.5a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd"/>
            </svg>
            {error}
          </div>
        </div>
      )}

      {/* ── Pipeline ──────────────────────────────────────────────────────── */}
      {hasStarted && (
        <div className="card-glow animate-fade-up rounded-2xl border border-white/[0.08] bg-[#0c0c14] p-6">
          <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-600">Pipeline</p>
          <div className="flex flex-col">
            {STEP_ORDER.map((s, i) => (
              <StepRow key={s} step={s} status={getStepStatus(s)} isLast={i === STEP_ORDER.length - 1} />
            ))}
          </div>
        </div>
      )}

      {/* ── Result card ───────────────────────────────────────────────────── */}
      {result && (step === "done" || step === "settling" || step === "settled") && (
        <div className={`animate-fade-up rounded-2xl border ${result.execute ? "border-emerald-500/20 bg-emerald-500/[0.04]" : "border-amber-500/20 bg-amber-500/[0.04]"}`}>
          <div className={`flex items-center gap-3 border-b px-5 py-4 ${result.execute ? "border-emerald-500/10" : "border-amber-500/10"}`}>
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${result.execute ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
              {result.execute ? (
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="2.5 8 6 12 13.5 4"/></svg>
              ) : (
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><line x1="8" y1="5" x2="8" y2="8"/><circle cx="8" cy="11" r=".5" fill="currentColor"/></svg>
              )}
            </div>
            <div>
              <p className={`font-semibold ${result.execute ? "text-emerald-300" : "text-amber-300"}`}>
                {result.execute ? "Condition Met — VEIL releases to counterparty" : "Condition Not Met — VEIL returns to you"}
              </p>
              <p className="text-xs text-zinc-600">Deal #{result.dealId.toString()} · TEE confirmed · amounts stay encrypted</p>
            </div>
          </div>

          <div className="space-y-3 px-5 py-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/[0.05] bg-black/20 px-3 py-2.5">
                <p className="mb-1 text-[10px] uppercase tracking-widest text-zinc-700">Market Price</p>
                <p className="font-mono text-sm font-bold text-white">${result.price.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-white/[0.05] bg-black/20 px-3 py-2.5">
                <p className="mb-1 text-[10px] uppercase tracking-widest text-zinc-700">Deal ID</p>
                <p className="font-mono text-sm font-bold text-white">#{result.dealId.toString()}</p>
              </div>
            </div>

            {explanation && (
              <div className="rounded-lg border border-white/[0.05] bg-black/20 px-3 py-2.5">
                <p className="mb-1 text-[10px] uppercase tracking-widest text-zinc-700">Why</p>
                <p className="text-sm leading-relaxed text-zinc-400">{explanation}</p>
              </div>
            )}

            {/* +1 VEIL reward */}
            <div className="animate-slide-in-right flex items-center gap-3 rounded-xl border border-violet-500/20 bg-violet-500/[0.07] px-4 py-3">
              <div className="token-float flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-violet-500/30 bg-violet-500/15 text-violet-300">
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M5.5 8h5M8 5.5v5"/></svg>
              </div>
              <div>
                <p className="text-sm font-bold text-violet-200">+1 VEIL earned</p>
                <p className="text-xs text-violet-500">Minted to your wallet · ERC-7984 confidential balance</p>
              </div>
            </div>

            {/* Settle button */}
            {step === "done" && (
              <button onClick={handleSettle} disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/[0.08] py-3 text-sm font-bold text-violet-300 transition hover:bg-violet-500/[0.14] disabled:opacity-50">
                {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-500/30 border-t-violet-400"/> : (
                  <>
                    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2.5 8 6 12 13.5 4"/></svg>
                    Settle Deal — Route Funds
                  </>
                )}
              </button>
            )}

            {/* Settled */}
            {step === "settled" && settleTx && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] px-4 py-3">
                  <svg viewBox="0 0 16 16" className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="2.5 8 6 12 13.5 4"/></svg>
                  <p className="text-sm font-bold text-emerald-300">Deal settled — funds routed privately</p>
                </div>
                <a href={`https://sepolia.arbiscan.io/tx/${settleTx}`} target="_blank" rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] py-3 text-sm font-semibold text-white transition hover:bg-white/[0.07]">
                  View Settlement on Arbiscan
                  <span className="font-mono text-xs text-zinc-600">{settleTx.slice(0, 8)}…{settleTx.slice(-6)}</span>
                </a>
              </div>
            )}

            <a href={`https://sepolia.arbiscan.io/tx/${result.txHash}`} target="_blank" rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] py-3 text-sm font-semibold text-white transition hover:bg-white/[0.07]">
              <svg viewBox="0 0 20 20" className="h-4 w-4 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 6H6a2 2 0 00-2 2v6a2 2 0 002 2h6a2 2 0 002-2v-4m-4-4h6m0 0v6m0-6L9.5 11"/></svg>
              View Deal on Arbiscan
              <span className="font-mono text-xs text-zinc-600">{result.txHash.slice(0, 8)}…{result.txHash.slice(-6)}</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

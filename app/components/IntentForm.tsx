"use client";

import { useState } from "react";
import { useWalletClient, usePublicClient, useAccount, useSwitchChain } from "wagmi";
import { arbitrumSepolia } from "viem/chains";
import { noxEncryptThreshold, type NoxEncryptResult } from "@/lib/noxEncrypt";
import { noxExecute, type NoxExecuteResult } from "@/lib/noxExecute";
import { generateExplanation } from "@/lib/explainResult";

// ── Types ─────────────────────────────────────────────────────────────────────

type StepStatus = "pending" | "active" | "done" | "error";

type PipelineState = {
  parse:    StepStatus;
  encrypt:  StepStatus;
  evaluate: StepStatus;
  execute:  StepStatus;
};

type ParsedIntent = {
  action: string;
  asset: string;
  amount: string;
  condition: string;
  source?: string;
};

type OverallStatus = "idle" | "running" | "executed" | "held" | "error";

const IDLE_PIPELINE: PipelineState = {
  parse:    "pending",
  encrypt:  "pending",
  evaluate: "pending",
  execute:  "pending",
};

// ── Step definitions ──────────────────────────────────────────────────────────

const STEP_META: Record<
  keyof PipelineState,
  { label: string; icon: React.ReactNode; activeLabel: string; doneLabel: string }
> = {
  parse: {
    label: "Parse",
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 4h12M2 8h8M2 12h5" strokeLinecap="round"/>
      </svg>
    ),
    activeLabel: "Parsing intent via ChainGPT…",
    doneLabel: "Intent parsed",
  },
  encrypt: {
    label: "Encrypt",
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="7" width="12" height="8" rx="1.5"/>
        <path d="M5 7V5a3 3 0 016 0v2" strokeLinecap="round"/>
      </svg>
    ),
    activeLabel: "Sealing threshold in Nox Gateway…",
    doneLabel: "Threshold sealed in TEE",
  },
  evaluate: {
    label: "Evaluate",
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="5"/>
        <path d="M8 5v3l2 2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    activeLabel: "SGX enclave evaluating condition…",
    doneLabel: "TEE result received",
  },
  execute: {
    label: "Result",
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 8l4 4 6-7" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    activeLabel: "Publishing result on-chain…",
    doneLabel: "Result published on-chain",
  },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StepRow({ stepKey, status, isLast }: {
  stepKey: keyof PipelineState;
  status: StepStatus;
  isLast: boolean;
}) {
  const meta = STEP_META[stepKey];
  const sublabel =
    status === "active" ? meta.activeLabel :
    status === "done"   ? meta.doneLabel   :
    status === "error"  ? "Failed"         :
    "Waiting";

  return (
    <div className="flex gap-4">
      {/* Icon column */}
      <div className="flex flex-col items-center">
        {status === "active" ? (
          <span className="pulse-glow flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-violet-500/50 bg-violet-500/10 text-violet-400">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-500/30 border-t-violet-400" />
          </span>
        ) : status === "done" ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30">
            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1.5 6 4.5 9 10.5 3" />
            </svg>
          </span>
        ) : status === "error" ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-400 ring-1 ring-red-500/30">
            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="2" y1="2" x2="10" y2="10" /><line x1="10" y1="2" x2="2" y2="10" />
            </svg>
          </span>
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.02] text-zinc-600">
            {meta.icon}
          </span>
        )}
        {!isLast && (
          <div className={`my-1.5 w-px flex-1 rounded-full transition-all duration-700 ${
            status === "done" ? "bg-emerald-500/30 min-h-[20px]" : "bg-white/[0.05] min-h-[20px]"
          }`} />
        )}
      </div>

      {/* Text column */}
      <div className="pb-5 pt-1">
        <p className={`text-sm font-semibold leading-none transition-colors duration-300 ${
          status === "done"   ? "text-white"      :
          status === "active" ? "text-violet-300" :
          status === "error"  ? "text-red-400"    :
          "text-zinc-600"
        }`}>
          {meta.label}
        </p>
        <p className={`mt-1 text-xs transition-colors duration-300 ${
          status === "active" ? "text-violet-400" :
          status === "done"   ? "text-zinc-500"   :
          status === "error"  ? "text-red-500"    :
          "text-zinc-700"
        }`}>
          {sublabel}
        </p>
      </div>
    </div>
  );
}

function Pipeline({ state }: { state: PipelineState }) {
  const steps = Object.keys(STEP_META) as (keyof PipelineState)[];
  return (
    <div className="card-glow animate-fade-up rounded-2xl border border-white/[0.08] bg-[#0c0c14] p-6">
      <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-600">Pipeline</p>
      <div className="flex flex-col">
        {steps.map((key, i) => (
          <StepRow key={key} stepKey={key} status={state[key]} isLast={i === steps.length - 1} />
        ))}
      </div>
    </div>
  );
}

function Spinner() {
  return <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-white" />;
}

function extractThreshold(condition: string): number {
  const match = condition.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

const QUICK_EXAMPLES = [
  "Buy ETH if price drops below 1800",
  "Sell ETH if price rises above 3500",
  "Buy ETH if price drops below 2000",
];

const AMOUNT_PRESETS = [25, 50, 100, 500];

// ── Main component ────────────────────────────────────────────────────────────

export function IntentForm() {
  const [intent, setIntent]   = useState("");
  const [amount, setAmount]   = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("");
  const [pipeline, setPipeline] = useState<PipelineState>(IDLE_PIPELINE);
  const [overallStatus, setOverallStatus] = useState<OverallStatus>("idle");
  const [parsed, setParsed]   = useState<ParsedIntent | null>(null);
  const [noxResult, setNoxResult] = useState<NoxEncryptResult | null>(null);
  const [execResult, setExecResult] = useState<NoxExecuteResult | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [txHash, setTxHash]   = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const isWrongNetwork = isConnected && chainId !== arbitrumSepolia.id;

  function setStep(step: keyof PipelineState, status: StepStatus) {
    setPipeline((p) => ({ ...p, [step]: status }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!isConnected) {
      setError("Connect your wallet first.");
      return;
    }
    if (isWrongNetwork) {
      switchChain({ chainId: arbitrumSepolia.id });
      return;
    }
    if (!walletClient || !publicClient) {
      setError("Wallet not ready — please try again.");
      return;
    }

    const contractAddress = (
      process.env.NEXT_PUBLIC_VEIL_CONTRACT ?? "0x0000000000000000000000000000000000000000"
    ) as `0x${string}`;

    setLoading(true);
    setError(null);
    setParsed(null);
    setNoxResult(null);
    setExecResult(null);
    setExplanation(null);
    setTxHash(null);
    setPipeline(IDLE_PIPELINE);
    setOverallStatus("running");

    try {
      // ── Step 1: ChainGPT parse ──────────────────────────────────────────
      setStep("parse", "active");
      setLoadingLabel("Parsing intent…");

      const parseRes = await fetch("/api/parse-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent, amount }),
      });
      if (!parseRes.ok) throw new Error(`Parse failed: ${parseRes.status}`);
      const parsedData: ParsedIntent = await parseRes.json();
      setParsed(parsedData);
      setStep("parse", "done");

      // ── Step 2: Nox encrypt ─────────────────────────────────────────────
      setStep("encrypt", "active");
      setLoadingLabel("Encrypting threshold…");

      const threshold = extractThreshold(parsedData.condition);
      const encrypted = await noxEncryptThreshold(walletClient, threshold, contractAddress);
      setNoxResult(encrypted);
      setStep("encrypt", "done");

      // ── Step 3: TEE evaluate ────────────────────────────────────────────
      setStep("evaluate", "active");
      setLoadingLabel("TEE evaluating…");

      const result = await noxExecute(walletClient, publicClient, encrypted, parsedData.condition, contractAddress);
      setExecResult(result);
      setTxHash(result.txHash);
      setStep("evaluate", "done");

      // ── Step 4: Record + explanation ────────────────────────────────────
      setStep("execute", "done");
      setOverallStatus(result.execute ? "executed" : "held");

      const condMatch = parsedData.condition.match(/price\s*([<>])\s*(\d+(?:\.\d+)?)/);
      setExplanation(generateExplanation({
        action:    parsedData.action as "buy" | "sell",
        asset:     parsedData.asset,
        operator:  (condMatch?.[1] ?? "<") as "<" | ">",
        threshold: condMatch ? parseFloat(condMatch[2]) : 0,
        price:     result.price,
        execute:   result.execute,
      }));

    } catch (err) {
      setPipeline((p) => {
        const updated = { ...p };
        for (const key of Object.keys(updated) as (keyof PipelineState)[]) {
          if (updated[key] === "active") updated[key] = "error";
        }
        return updated;
      });
      setOverallStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const hasStarted = pipeline.parse !== "pending";

  return (
    <div className="flex flex-col gap-4">

      {/* ── Form card ─────────────────────────────────────────────────────── */}
      <div className="card-glow rounded-2xl border border-white/[0.08] bg-[#0c0c14] p-7">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 ring-1 ring-violet-500/20 text-violet-400">
              <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M10 2l7 3v4c0 4.4-3 8.3-7 9.4C6 17.3 3 13.4 3 9V5l7-3z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Create Intent</h2>
              <p className="mt-0.5 text-xs text-zinc-600">Condition encrypted before leaving your device</p>
            </div>
          </div>
          {overallStatus !== "idle" && (
            <StatusBadge status={overallStatus} />
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Intent input */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-600">
              Intent
            </label>
            <input
              type="text"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="Buy ETH if price drops below 2000"
              required
              disabled={loading}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder-zinc-700 outline-none ring-0 transition-all duration-200 focus:border-violet-500/50 focus:bg-violet-500/[0.04] focus:ring-1 focus:ring-violet-500/20 disabled:opacity-40"
            />
            {/* Quick-fill examples */}
            <div className="flex flex-wrap gap-1.5">
              {QUICK_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  disabled={loading}
                  onClick={() => setIntent(ex)}
                  className="rounded-md border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-600 transition hover:border-violet-500/30 hover:text-violet-400 disabled:opacity-30"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {/* Amount input */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-600">
              Amount (USDC)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100"
              min="1"
              required
              disabled={loading}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder-zinc-700 outline-none ring-0 transition-all duration-200 focus:border-violet-500/50 focus:bg-violet-500/[0.04] focus:ring-1 focus:ring-violet-500/20 disabled:opacity-40"
            />
            {/* Amount presets */}
            <div className="flex gap-2">
              {AMOUNT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={loading}
                  onClick={() => setAmount(String(preset))}
                  className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition disabled:opacity-30 ${
                    amount === String(preset)
                      ? "border-violet-500/40 bg-violet-500/10 text-violet-300"
                      : "border-white/[0.07] bg-white/[0.02] text-zinc-600 hover:border-violet-500/30 hover:text-violet-400"
                  }`}
                >
                  ${preset}
                </button>
              ))}
            </div>
          </div>

          {/* CTA */}
          <button
            type="submit"
            disabled={loading}
            className={`mt-1 flex w-full items-center justify-center gap-2.5 rounded-xl py-3.5 text-sm font-bold text-white shadow-lg transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${
              isWrongNetwork
                ? "bg-amber-600 shadow-amber-900/30 hover:bg-amber-500"
                : loading
                ? "bg-violet-800"
                : "btn-shimmer shadow-violet-900/40"
            }`}
          >
            {loading ? (
              <><Spinner /><span>{loadingLabel}</span></>
            ) : isWrongNetwork ? (
              <>
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M8 2v4m0 4v.5M4 8H2m12 0h-2M4.9 4.9L3.5 3.5m9 9-1.4-1.4M4.9 11.1l-1.4 1.4m9-9-1.4 1.4" strokeLinecap="round"/>
                </svg>
                Switch to Arbitrum Sepolia
              </>
            ) : (
              <>
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="6" width="12" height="9" rx="1.5"/>
                  <path d="M5 6V4a3 3 0 016 0v2" strokeLinecap="round"/>
                  <circle cx="8" cy="10.5" r="1" fill="currentColor" stroke="none"/>
                </svg>
                Encrypt &amp; Submit Intent
              </>
            )}
          </button>
        </form>
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="animate-fade-up rounded-xl border border-red-500/20 bg-red-500/[0.06] px-5 py-4 text-sm text-red-400">
          <div className="flex items-start gap-3">
            <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0" fill="currentColor">
              <path fillRule="evenodd" d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm7.25-3.25a.75.75 0 011.5 0V8a.75.75 0 01-1.5 0V4.75zm.75 5.5a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd"/>
            </svg>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* ── Pipeline tracker ──────────────────────────────────────────────── */}
      {hasStarted && <Pipeline state={pipeline} />}

      {/* ── Encrypted threshold ───────────────────────────────────────────── */}
      {noxResult && (
        <div className="card-glow animate-fade-up rounded-2xl border border-violet-500/15 bg-violet-500/[0.04] p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-600">Encrypted Threshold</p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/25 bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-400">
              <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="1.5" y="5" width="9" height="6" rx="1"/>
                <path d="M4 5V3.5a2 2 0 014 0V5" strokeLinecap="round"/>
              </svg>
              Sealed in TEE
            </span>
          </div>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-[10px] text-zinc-700">Handle</p>
              <p className="break-all rounded-lg bg-black/30 px-3 py-2 font-mono text-xs leading-relaxed text-violet-300">{noxResult.handle}</p>
            </div>
            <div>
              <p className="mb-1 text-[10px] text-zinc-700">Proof</p>
              <p className="break-all rounded-lg bg-black/30 px-3 py-2 font-mono text-xs leading-relaxed text-violet-400/40 line-clamp-2">{noxResult.handleProof}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Parsed intent ─────────────────────────────────────────────────── */}
      {parsed && (
        <div className={`animate-fade-up card-glow rounded-2xl border border-white/[0.07] bg-[#0c0c14] p-6 transition-opacity duration-500 ${loading ? "opacity-40" : "opacity-100"}`}>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-600">Parsed Intent</p>
            {parsed.source && (
              <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] text-zinc-600">
                via {parsed.source}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2.5">
            {(["action", "asset", "amount", "condition"] as const).map((k) => (
              <div key={k} className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                <span className="text-xs capitalize text-zinc-600">{k}</span>
                <span className="font-mono text-sm font-medium text-violet-300">{parsed[k]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Execution result ──────────────────────────────────────────────── */}
      {execResult && (
        <div className={`animate-fade-up rounded-2xl border ${
          execResult.execute
            ? "border-emerald-500/20 bg-emerald-500/[0.04]"
            : "border-amber-500/20 bg-amber-500/[0.04]"
        }`}>
          {/* Status header */}
          <div className={`flex items-center gap-3 border-b px-5 py-4 ${
            execResult.execute ? "border-emerald-500/10" : "border-amber-500/10"
          }`}>
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              execResult.execute ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
            }`}>
              {execResult.execute ? (
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="2.5 8 6 12 13.5 4"/>
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="8" cy="8" r="6"/><line x1="8" y1="5" x2="8" y2="8"/><circle cx="8" cy="11" r=".5" fill="currentColor"/>
                </svg>
              )}
            </div>
            <div>
              <p className={`font-semibold ${execResult.execute ? "text-emerald-300" : "text-amber-300"}`}>
                {execResult.execute ? "Trade Executed" : "Trade Held"}
              </p>
              <p className="text-xs text-zinc-600">
                {execResult.execute ? "Condition met · TEE confirmed on-chain" : "Condition not met · intent is pending"}
              </p>
            </div>
          </div>

          {/* Details */}
          <div className="px-5 py-4 space-y-3">
            {/* Stats row */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/[0.05] bg-black/20 px-3 py-2.5">
                <p className="mb-1 text-[10px] text-zinc-700 uppercase tracking-widest font-medium">Market Price</p>
                <p className="font-mono text-sm font-bold text-white">${execResult.price.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-white/[0.05] bg-black/20 px-3 py-2.5">
                <p className="mb-1 text-[10px] text-zinc-700 uppercase tracking-widest font-medium">Result Handle</p>
                <p className="truncate font-mono text-xs text-zinc-500">{execResult.resultHandle.slice(0, 18)}…</p>
              </div>
            </div>

            {/* Explanation */}
            {explanation && (
              <div className="rounded-lg border border-white/[0.05] bg-black/20 px-3 py-2.5">
                <p className="mb-1 text-[10px] text-zinc-700 uppercase tracking-widest font-medium">Why</p>
                <p className="text-sm leading-relaxed text-zinc-400">{explanation}</p>
              </div>
            )}

            {/* Explorer link */}
            {txHash && (
              <a
                href={`https://sepolia.arbiscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] py-3 text-sm font-semibold text-white transition hover:bg-white/[0.07] hover:border-white/[0.14]"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 6H6a2 2 0 00-2 2v6a2 2 0 002 2h6a2 2 0 002-2v-4m-4-4h6m0 0v6m0-6L9.5 11"/>
                </svg>
                View on Arbiscan
                <span className="ml-1 font-mono text-xs text-zinc-600">{txHash.slice(0, 8)}…{txHash.slice(-6)}</span>
              </a>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: OverallStatus }) {
  if (status === "idle") return null;

  const config = {
    running:  { label: "Processing",  cls: "border-violet-500/25 bg-violet-500/8 text-violet-300",    dot: "bg-violet-400 animate-pulse" },
    executed: { label: "Executed",    cls: "border-emerald-500/25 bg-emerald-500/8 text-emerald-300", dot: "bg-emerald-400"               },
    held:     { label: "Held",        cls: "border-amber-500/25 bg-amber-500/8 text-amber-300",       dot: "bg-amber-400"                },
    error:    { label: "Error",       cls: "border-red-500/25 bg-red-500/8 text-red-300",             dot: "bg-red-400"                  },
  }[status];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${config.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

"use client";

import { useState } from "react";
import { useWalletClient, usePublicClient } from "wagmi";
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
  { title: string; activeLabel: string; doneLabel: string }
> = {
  parse:    { title: "Parse",    activeLabel: "Reading intent via ChainGPT…",       doneLabel: "Intent parsed"                },
  encrypt:  { title: "Encrypt",  activeLabel: "Encrypting threshold in TEE…",        doneLabel: "Threshold sealed"             },
  evaluate: { title: "Evaluate", activeLabel: "TEE evaluating condition privately…", doneLabel: "Condition evaluated"          },
  execute:  { title: "Record",   activeLabel: "Writing result on-chain…",            doneLabel: "Result recorded on-chain"     },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: OverallStatus }) {
  if (status === "idle") return null;

  const config = {
    running:  { label: "Processing",  cls: "border-violet-500/30 bg-violet-500/10 text-violet-300",  dot: "bg-violet-400 animate-pulse" },
    executed: { label: "Executed",    cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", dot: "bg-emerald-400"             },
    held:     { label: "Held",        cls: "border-amber-500/30 bg-amber-500/10 text-amber-300",       dot: "bg-amber-400"               },
    error:    { label: "Error",       cls: "border-red-500/30 bg-red-500/10 text-red-300",             dot: "bg-red-400"                 },
  }[status];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done") return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500">
      <svg viewBox="0 0 12 12" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="1.5 6 4.5 9 10.5 3" />
      </svg>
    </span>
  );
  if (status === "error") return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500">
      <svg viewBox="0 0 12 12" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="2" y1="2" x2="10" y2="10" /><line x1="10" y1="2" x2="2" y2="10" />
      </svg>
    </span>
  );
  if (status === "active") return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
  );
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10">
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
    </span>
  );
}

function Pipeline({ state }: { state: PipelineState }) {
  const steps = Object.keys(STEP_META) as (keyof PipelineState)[];
  return (
    <div className="animate-fade-in rounded-xl border border-white/10 bg-zinc-900 p-5">
      <p className="mb-4 text-xs font-medium uppercase tracking-widest text-zinc-500">Pipeline</p>
      <div className="flex flex-col gap-0">
        {steps.map((key, i) => {
          const { title, activeLabel, doneLabel } = STEP_META[key];
          const status = state[key];
          const isLast = i === steps.length - 1;
          const sublabel =
            status === "active" ? activeLabel :
            status === "done"   ? doneLabel   :
            status === "error"  ? "Failed"    :
            "Waiting";
          return (
            <div key={key} className="flex gap-3">
              <div className="flex flex-col items-center">
                <StepIcon status={status} />
                {!isLast && (
                  <div className={`w-px my-1 flex-1 transition-colors duration-500 ${status === "done" ? "bg-emerald-500/40" : "bg-white/5"}`} />
                )}
              </div>
              <div className="pb-4">
                <p className={`text-sm font-medium transition-colors duration-300 ${
                  status === "done"   ? "text-white"       :
                  status === "active" ? "text-violet-300"  :
                  status === "error"  ? "text-red-400"     :
                  "text-zinc-600"
                }`}>{title}</p>
                <p className={`text-xs transition-colors duration-300 ${
                  status === "active" ? "text-violet-500" :
                  status === "done"   ? "text-zinc-500"   :
                  status === "error"  ? "text-red-600"    :
                  "text-zinc-700"
                }`}>{sublabel}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Spinner() {
  return <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" />;
}

function extractThreshold(condition: string): number {
  const match = condition.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

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
  const [error, setError]     = useState<string | null>(null);

  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  function setStep(step: keyof PipelineState, status: StepStatus) {
    setPipeline((p) => ({ ...p, [step]: status }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!walletClient || !publicClient) {
      setError("Connect your wallet first.");
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
      <div className="rounded-xl border border-white/10 bg-zinc-900 p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Create Intent</h2>
          <StatusBadge status={overallStatus} />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-widest text-zinc-500">Intent</label>
            <input
              type="text"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="Buy ETH if price drops below 2000"
              required
              disabled={loading}
              className="rounded-lg border border-white/10 bg-zinc-800 px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/30 disabled:opacity-50"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-widest text-zinc-500">Amount (USDC)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100"
              min="1"
              required
              disabled={loading}
              className="rounded-lg border border-white/10 bg-zinc-800 px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/30 disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <><Spinner />{loadingLabel}</> : "Encrypt & Submit Intent"}
          </button>
        </form>
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="animate-fade-in rounded-xl border border-red-500/20 bg-red-500/5 px-5 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* ── Pipeline tracker ──────────────────────────────────────────────── */}
      {hasStarted && <Pipeline state={pipeline} />}

      {/* ── Parsed intent ─────────────────────────────────────────────────── */}
      {parsed && (
        <div className={`animate-fade-in rounded-xl border border-white/10 bg-zinc-900 p-5 transition-opacity duration-500 ${loading ? "opacity-40" : "opacity-100"}`}>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Parsed Intent</p>
            {parsed.source && (
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-zinc-500">
                via {parsed.source}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {(["action", "asset", "amount", "condition"] as const).map((k) => (
              <div key={k} className="flex items-center justify-between">
                <span className="text-xs capitalize text-zinc-500">{k}</span>
                <span className="font-mono text-sm text-violet-300">{parsed[k]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Encrypted threshold ───────────────────────────────────────────── */}
      {noxResult && (
        <div className="animate-fade-in rounded-xl border border-violet-500/20 bg-violet-500/5 p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Encrypted Threshold</p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-xs text-violet-400">
              <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="1.5" y="5" width="9" height="6" rx="1" />
                <path d="M4 5V3.5a2 2 0 014 0V5" />
              </svg>
              Sealed
            </span>
          </div>
          <p className="mb-1 text-xs text-zinc-600">Handle</p>
          <p className="break-all font-mono text-xs leading-relaxed text-violet-300">{noxResult.handle}</p>
          <p className="mt-2 mb-1 text-xs text-zinc-600">Proof</p>
          <p className="break-all font-mono text-xs leading-relaxed text-violet-400/50">{noxResult.handleProof}</p>
        </div>
      )}

      {/* ── Execution result (hero decision) ─────────────────────────────── */}
      {execResult && (
        <div className={`animate-fade-in rounded-xl border p-5 ${
          execResult.execute
            ? "border-emerald-500/20 bg-emerald-500/5"
            : "border-amber-500/20 bg-amber-500/5"
        }`}>
          {/* Hero decision */}
          <div className={`mb-4 flex items-center gap-3 ${execResult.execute ? "text-emerald-400" : "text-amber-400"}`}>
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              execResult.execute ? "bg-emerald-500/20" : "bg-amber-500/20"
            }`}>
              {execResult.execute ? (
                <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
              )}
            </span>
            <div>
              <p className="text-lg font-bold leading-none">
                {execResult.execute ? "Trade Executed" : "Trade Held"}
              </p>
              <p className={`mt-0.5 text-xs ${execResult.execute ? "text-emerald-600" : "text-amber-600"}`}>
                {execResult.execute ? "Condition met — intent recorded on-chain" : "Condition not met — intent pending"}
              </p>
            </div>
          </div>

          {/* Stats row */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-white/5 bg-black/20 px-3 py-2.5">
              <p className="mb-0.5 text-xs text-zinc-600">Market Price</p>
              <p className="font-mono text-sm font-semibold text-white">${execResult.price.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-white/5 bg-black/20 px-3 py-2.5">
              <p className="mb-0.5 text-xs text-zinc-600">Result Handle</p>
              <p className="truncate font-mono text-xs text-zinc-400">{execResult.resultHandle.slice(0, 18)}…</p>
            </div>
          </div>

          {/* Explanation */}
          {explanation && (
            <div className="rounded-lg border border-white/5 bg-black/20 px-3 py-2.5">
              <p className="mb-0.5 text-xs text-zinc-600">Why</p>
              <p className="text-sm leading-relaxed text-zinc-300">{explanation}</p>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

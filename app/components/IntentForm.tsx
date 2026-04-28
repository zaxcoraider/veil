"use client";

import { useState } from "react";
import { useWalletClient, usePublicClient } from "wagmi";
import { noxEncryptThreshold, type NoxEncryptResult } from "@/lib/noxEncrypt";
import { noxExecute, type NoxExecuteResult } from "@/lib/noxExecute";

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

const IDLE_PIPELINE: PipelineState = {
  parse:    "pending",
  encrypt:  "pending",
  evaluate: "pending",
  execute:  "pending",
};

// ── Pipeline step component ───────────────────────────────────────────────────

const STEP_LABELS: Record<keyof PipelineState, { title: string; sub: string }> = {
  parse:    { title: "ChainGPT",   sub: "Parse natural language intent" },
  encrypt:  { title: "Nox TEE",    sub: "Encrypt threshold privately"   },
  evaluate: { title: "TEE Runner", sub: "Evaluate condition confidentially" },
  execute:  { title: "Contract",   sub: "Record execution decision"     },
};

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done")
    return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-xs text-white">✓</span>;
  if (status === "error")
    return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs text-white">✕</span>;
  if (status === "active")
    return <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />;
  return <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 text-xs text-zinc-600">·</span>;
}

function Pipeline({ state }: { state: PipelineState }) {
  const steps = Object.keys(STEP_LABELS) as (keyof PipelineState)[];
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900 p-5">
      <p className="mb-4 text-xs font-medium uppercase tracking-widest text-zinc-500">Pipeline</p>
      <div className="flex flex-col gap-0">
        {steps.map((key, i) => {
          const { title, sub } = STEP_LABELS[key];
          const status = state[key];
          const isLast = i === steps.length - 1;
          return (
            <div key={key} className="flex gap-3">
              {/* Left: icon + connector */}
              <div className="flex flex-col items-center">
                <StepIcon status={status} />
                {!isLast && (
                  <div className={`w-px flex-1 my-1 ${status === "done" ? "bg-emerald-500/40" : "bg-white/5"}`} />
                )}
              </div>
              {/* Right: label */}
              <div className={`pb-4 ${isLast ? "" : ""}`}>
                <p className={`text-sm font-medium ${status === "done" ? "text-white" : status === "active" ? "text-violet-300" : "text-zinc-600"}`}>
                  {title}
                </p>
                <p className="text-xs text-zinc-600">{sub}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractThreshold(condition: string): number {
  const match = condition.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />;
}

// ── Main component ────────────────────────────────────────────────────────────

export function IntentForm() {
  const [intent, setIntent]   = useState("");
  const [amount, setAmount]   = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("");
  const [pipeline, setPipeline] = useState<PipelineState>(IDLE_PIPELINE);
  const [parsed, setParsed]   = useState<ParsedIntent | null>(null);
  const [noxResult, setNoxResult] = useState<NoxEncryptResult | null>(null);
  const [execResult, setExecResult] = useState<NoxExecuteResult | null>(null);
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
    setPipeline(IDLE_PIPELINE);

    try {
      // ── Step 1: ChainGPT parse ──────────────────────────────────────────
      setStep("parse", "active");
      setLoadingLabel("ChainGPT parsing…");

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
      setLoadingLabel("Nox encrypting…");

      const threshold = extractThreshold(parsedData.condition);
      const encrypted = await noxEncryptThreshold(walletClient, threshold, contractAddress);
      setNoxResult(encrypted);
      setStep("encrypt", "done");

      // ── Step 3: TEE evaluate ────────────────────────────────────────────
      setStep("evaluate", "active");
      setLoadingLabel("TEE evaluating…");

      const result = await noxExecute(walletClient, publicClient, threshold, contractAddress);
      setExecResult(result);
      setStep("evaluate", "done");

      // ── Step 4: Contract result ─────────────────────────────────────────
      setStep("execute", result.execute ? "done" : "done");

    } catch (err) {
      // Mark active step as errored
      setPipeline((p) => {
        const updated = { ...p };
        for (const key of Object.keys(updated) as (keyof PipelineState)[]) {
          if (updated[key] === "active") updated[key] = "error";
        }
        return updated;
      });
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const hasStarted = pipeline.parse !== "pending";

  return (
    <div className="flex flex-col gap-4">

      {/* Form */}
      <div className="rounded-xl border border-white/10 bg-zinc-900 p-6 shadow-xl">
        <h2 className="mb-5 text-base font-semibold text-white">Create Intent</h2>
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

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-5 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Live pipeline tracker */}
      {hasStarted && <Pipeline state={pipeline} />}

      {/* Parsed intent */}
      {parsed && (
        <div className="rounded-xl border border-white/10 bg-zinc-900 p-5">
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

      {/* Encrypted threshold */}
      {noxResult && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Encrypted Threshold</p>
            <span className="rounded-full border border-violet-500/30 px-2 py-0.5 text-xs text-violet-400">iExec Nox</span>
          </div>
          <p className="mb-1 text-xs text-zinc-600">Handle</p>
          <p className="break-all font-mono text-xs text-violet-300 leading-relaxed">{noxResult.handle}</p>
          <p className="mt-2 mb-1 text-xs text-zinc-600">Proof</p>
          <p className="break-all font-mono text-xs text-violet-400/50 leading-relaxed">{noxResult.handleProof}</p>
        </div>
      )}

      {/* Execution result */}
      {execResult && (
        <div className={`rounded-xl border p-5 ${execResult.execute ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-zinc-500">Execution Result</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Decision</span>
              <span className={`font-mono text-sm font-semibold ${execResult.execute ? "text-emerald-400" : "text-amber-400"}`}>
                {execResult.execute ? "✓ Execute" : "⏸ Hold"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Market Price</span>
              <span className="font-mono text-sm text-zinc-300">${execResult.price}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Result Handle</span>
              <span className="font-mono text-xs text-zinc-600 truncate ml-4 max-w-[180px]">{execResult.resultHandle}</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

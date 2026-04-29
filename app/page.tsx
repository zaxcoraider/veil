import Image from "next/image";
import { ConnectButton } from "./components/ConnectButton";
import { IntentForm } from "./components/IntentForm";

const CONTRACT = process.env.NEXT_PUBLIC_VEIL_CONTRACT ?? "0x0000000000000000000000000000000000000000";

export default function Home() {
  return (
    <div className="relative min-h-screen bg-mesh bg-grid overflow-x-hidden">

      {/* ── Top announcement bar ──────────────────────────────────────────── */}
      <div className="w-full border-b border-white/[0.04] bg-[#030308]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-2">
          <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wider">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              TEE Active
            </span>
            <span className="text-zinc-800">|</span>
            <span className="hidden text-zinc-600 sm:block">iExec Nox Protocol</span>
            <span className="hidden text-zinc-800 sm:block">·</span>
            <span className="hidden text-zinc-600 sm:block">Intel SGX / TDX</span>
          </div>
          <a
            href={`https://sepolia.arbiscan.io/address/${CONTRACT}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1 text-[10px] text-zinc-700 transition hover:text-zinc-400 sm:flex"
          >
            Contract: {CONTRACT.slice(0, 6)}…{CONTRACT.slice(-4)}
            <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1.5 8.5l7-7M3 1.5h5v5"/>
            </svg>
          </a>
        </div>
      </div>

      {/* ── Navbar ────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] backdrop-blur-xl bg-[#04040a]/70">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">

          {/* Left: logo + nav */}
          <div className="flex items-center gap-5">
            <Image src="/logo.png" alt="Veil" width={38} height={38} className="rounded-lg" priority />
            <nav className="hidden items-center gap-1 sm:flex">
              <a href="#trade" className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-sm font-medium text-white">
                Trade
              </a>
              <a href="#how" className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 transition hover:text-zinc-300">
                How it works
              </a>
              <a
                href={`https://sepolia.arbiscan.io/address/${CONTRACT}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-zinc-500 transition hover:text-zinc-300"
              >
                Contract
                <svg viewBox="0 0 10 10" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1.5 8.5l7-7M3 1.5h5v5"/>
                </svg>
              </a>
            </nav>
          </div>

          {/* Right: network + connect */}
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-violet-500/20 bg-violet-500/5 px-3 py-1 text-xs text-violet-400 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
              Arbitrum Sepolia
            </span>
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-5xl px-6 pb-32">

        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <div id="trade" className="pt-14 pb-12 text-center animate-fade-up">

          {/* Logo */}
          <div className="mb-6 flex justify-center">
            <Image src="/logo.png" alt="Veil" width={108} height={108} className="rounded-2xl opacity-95" priority />
          </div>

          {/* Badge */}
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Powered by iExec Nox · Intel SGX / TDX Enclaves
          </div>

          {/* Headline */}
          <h1 className="mx-auto max-w-2xl text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Trade without{" "}
            <span className="gradient-text">revealing your intent</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-zinc-500">
            Your price threshold is sealed inside a Trusted Execution Environment.
            The blockchain never sees your condition — only the cryptographic result.
          </p>

          {/* Trust stats */}
          <div className="mx-auto mt-10 grid max-w-md grid-cols-3 gap-3">
            {[
              { value: "100%", label: "On-chain result" },
              { value: "0 b",  label: "Plaintext exposed" },
              { value: "SGX",  label: "TEE standard" },
            ].map(({ value, label }) => (
              <div key={label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <p className="text-xl font-bold gradient-text">{value}</p>
                <p className="mt-0.5 text-[11px] text-zinc-600">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Intent form ───────────────────────────────────────────────── */}
        <div className="mx-auto max-w-xl animate-fade-up" style={{ animationDelay: "0.1s" }}>
          <IntentForm />
        </div>

        {/* ── How it works ──────────────────────────────────────────────── */}
        <div id="how" className="mt-28 animate-fade-up" style={{ animationDelay: "0.15s" }}>
          <div className="mb-10 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-700">Protocol</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Confidential by design</h2>
            <p className="mt-2 text-sm text-zinc-600">Three steps. Zero plaintext on-chain.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                step: "01",
                title: "Encrypt",
                color: "violet",
                icon: (
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <rect x="3" y="11" width="18" height="11" rx="2"/>
                    <path d="M7 11V7a5 5 0 0110 0v4"/>
                  </svg>
                ),
                desc: "Your price threshold is sealed in the iExec Nox Gateway — a KMS backed by Intel TDX. The plaintext never leaves your device unencrypted.",
              },
              {
                step: "02",
                title: "Evaluate",
                color: "indigo",
                icon: (
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9"/>
                    <path d="M12 7v5l3 3"/>
                  </svg>
                ),
                desc: "VeilExecutor triggers a confidential comparison inside an SGX enclave. Neither the contract nor any observer ever sees your threshold.",
              },
              {
                step: "03",
                title: "Execute",
                color: "cyan",
                icon: (
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                ),
                desc: "The boolean result is published on-chain via Nox public decryption. Your strategy stays private — only the outcome is public and verifiable.",
              },
            ].map(({ step, title, color, icon, desc }) => (
              <div key={step} className="card-glow rounded-2xl border border-white/[0.07] bg-[#0c0c14] p-6">
                <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${
                  color === "violet" ? "bg-violet-500/10 text-violet-400 ring-violet-500/20"
                  : color === "indigo" ? "bg-indigo-500/10 text-indigo-400 ring-indigo-500/20"
                  : "bg-cyan-500/10 text-cyan-400 ring-cyan-500/20"
                }`}>
                  {icon}
                </div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-700">Step {step}</p>
                <p className="mb-2 text-base font-bold text-white">{title}</p>
                <p className="text-sm leading-relaxed text-zinc-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div className="mt-20 flex flex-col items-center gap-3 border-t border-white/[0.04] pt-10">
          <Image src="/logo.png" alt="Veil" width={30} height={30} className="rounded-lg opacity-30" />
          <p className="text-xs text-zinc-700">
            Built for iExec Vibe Coding Challenge · Arbitrum Sepolia testnet
          </p>
          <div className="flex items-center gap-5">
            <a
              href={`https://sepolia.arbiscan.io/address/${CONTRACT}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-700 transition hover:text-zinc-400"
            >
              Contract ↗
            </a>
            <a
              href="https://docs.iex.ec/nox-protocol"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-700 transition hover:text-zinc-400"
            >
              iExec Nox Docs ↗
            </a>
            <a
              href="https://dorahacks.io/hackathon/vibe-coding-iexec"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-700 transition hover:text-zinc-400"
            >
              DoraHacks ↗
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

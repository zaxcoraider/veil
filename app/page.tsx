import Image from "next/image";
import { ConnectButton } from "./components/ConnectButton";
import { IntentForm } from "./components/IntentForm";

const CONTRACT = process.env.NEXT_PUBLIC_VEIL_CONTRACT ?? "0x0000000000000000000000000000000000000000";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-[#04040a]">

      {/* ── Navbar ────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#04040a]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">

          {/* Logo + nav */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <Image src="/logo.png" alt="Veil" width={30} height={30} className="rounded-md" priority />
              <span className="text-sm font-semibold text-white">Veil</span>
            </div>
            <nav className="hidden items-center gap-1 sm:flex">
              <a href="#trade" className="rounded-md px-3 py-1.5 text-sm font-medium text-white bg-white/[0.06]">Trade</a>
              <a href="#how"   className="rounded-md px-3 py-1.5 text-sm text-zinc-500 transition hover:text-zinc-200">How it works</a>
              <a
                href={`https://sepolia.arbiscan.io/address/${CONTRACT}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-zinc-500 transition hover:text-zinc-200"
              >
                Contract
                <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1.5 8.5l7-7M3 1.5h5v5"/>
                </svg>
              </a>
            </nav>
          </div>

          {/* Right */}
          <div className="flex items-center gap-2.5">
            <span className="hidden items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs text-zinc-500 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Arbitrum Sepolia
            </span>
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <main id="trade" className="mx-auto flex w-full max-w-[500px] flex-1 flex-col px-4 pt-10 pb-20">

        {/* Minimal intro */}
        <div className="mb-8 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs text-zinc-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Powered by iExec Nox · Intel SGX / TDX
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">
            Trade without{" "}
            <span className="gradient-text">revealing your intent</span>
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Your threshold is sealed in a TEE. Only the result is published on-chain.
          </p>
        </div>

        {/* Form */}
        <IntentForm />
      </main>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section id="how" className="border-t border-white/[0.04] py-20">
        <div className="mx-auto max-w-3xl px-5">
          <div className="mb-10 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-700">Protocol</p>
            <h2 className="mt-2 text-xl font-bold text-white">Confidential by design</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              {
                n: "01", title: "Encrypt",
                desc: "Your price threshold is sealed in the Nox Gateway — a KMS backed by Intel TDX. The plaintext never leaves your device.",
                icon: <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" strokeLinecap="round" strokeLinejoin="round"/>,
              },
              {
                n: "02", title: "Evaluate",
                desc: "VeilExecutor triggers a confidential comparison inside an SGX enclave. No observer ever sees your threshold.",
                icon: <><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2.5" strokeLinecap="round"/></>,
              },
              {
                n: "03", title: "Execute",
                desc: "The boolean result is published on-chain via Nox public decryption. Your strategy stays private — only the outcome is public.",
                icon: <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeLinecap="round" strokeLinejoin="round"/>,
              },
            ].map(({ n, title, desc, icon }) => (
              <div key={n} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04]">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-violet-400" fill="none" stroke="currentColor" strokeWidth="1.5">{icon}</svg>
                </div>
                <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-700">Step {n}</p>
                <p className="mb-1.5 text-sm font-semibold text-white">{title}</p>
                <p className="text-xs leading-relaxed text-zinc-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.04] py-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="Veil" width={20} height={20} className="rounded opacity-40" />
            <span className="text-xs text-zinc-700">© 2025 Veil</span>
          </div>
          <div className="flex items-center gap-5">
            {[
              { label: "Contract", href: `https://sepolia.arbiscan.io/address/${CONTRACT}` },
              { label: "iExec Nox Docs", href: "https://docs.iex.ec/nox-protocol" },
              { label: "DoraHacks", href: "https://dorahacks.io/hackathon/vibe-coding-iexec" },
            ].map(({ label, href }) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                className="text-xs text-zinc-700 transition hover:text-zinc-400">
                {label} ↗
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

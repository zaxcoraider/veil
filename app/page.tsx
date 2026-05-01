import Image from "next/image";
import { ConnectButton }     from "./components/ConnectButton";
import { DealForm }          from "./components/DealForm";
import { VeilTokenWidget }   from "./components/VeilTokenWidget";
import { LivePrice }         from "./components/LivePrice";

const CONTRACT = process.env.NEXT_PUBLIC_VEIL_CONTRACT ?? "0x0000000000000000000000000000000000000000";
const TOKEN    = process.env.NEXT_PUBLIC_VEIL_TOKEN    ?? "0x0000000000000000000000000000000000000000";

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-[#04040a]">

      {/* ── Ambient orbs ──────────────────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="orb-violet absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full bg-violet-600/10 blur-[120px]" />
        <div className="orb-indigo absolute -right-40 top-20 h-[500px] w-[500px] rounded-full bg-indigo-600/8 blur-[100px]" />
        <div className="orb-cyan   absolute bottom-0 left-1/2 h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-cyan-500/5 blur-[100px]" />
        {/* Dot grid */}
        <div className="bg-grid absolute inset-0 opacity-40" />
      </div>

      {/* ── Navbar ────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-white/[0.05] bg-[#04040a]/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="absolute inset-0 rounded-lg bg-violet-500/30 blur-md" />
                <Image src="/logo.png" alt="Veil" width={28} height={28} className="relative rounded-lg" priority />
              </div>
              <span className="text-sm font-bold tracking-tight text-white">Veil</span>
            </div>
            <nav className="hidden items-center gap-0.5 sm:flex">
              <a href="#trade"  className="rounded-lg px-3 py-1.5 text-sm font-medium text-white bg-white/[0.05]">Trade</a>
              <a href="#how"    className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 transition hover:text-zinc-300">How it works</a>
              <a
                href={`https://sepolia.arbiscan.io/address/${CONTRACT}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-zinc-500 transition hover:text-zinc-300"
              >
                Contract
                <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1.5 8.5l7-7M3 1.5h5v5"/>
                </svg>
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-2.5">
            <LivePrice />
            <span className="hidden items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs text-zinc-500 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Arbitrum Sepolia
            </span>
            <VeilTokenWidget />
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-12 pt-20 text-center">

        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/[0.07] px-4 py-1.5 text-xs text-violet-300">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
          Powered by iExec Nox · Intel SGX / TDX
          <span className="mx-1 h-3 w-px bg-violet-500/30" />
          <span className="font-bold text-violet-200">ERC-7984 Confidential Tokens</span>
        </div>

        <h1 className="mx-auto max-w-3xl text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
          Trade without{" "}
          <span className="gradient-text">revealing your intent</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-zinc-500">
          Your price threshold is sealed inside an Intel SGX enclave via iExec Nox.
          Only the boolean result ever touches the blockchain.
          Earn confidential <strong className="text-violet-400">VEIL tokens</strong> on every submission.
        </p>

        {/* Stats row */}
        <div className="mx-auto mt-8 flex max-w-lg items-center justify-center gap-6">
          {[
            { label: "Protocol",  value: "iExec Nox" },
            { label: "Token",     value: "ERC-7984"  },
            { label: "Network",   value: "Arb Sepolia" },
            { label: "TEE",       value: "Intel TDX" },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-700">{label}</span>
              <span className="text-xs font-bold text-zinc-300">{value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Main layout: form + sidebar ───────────────────────────────────── */}
      <main id="trade" className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-5 pb-24">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">

          {/* Deal form — left / center */}
          <div className="w-full lg:max-w-[520px]">
            <DealForm />
          </div>

          {/* Sidebar — protocol info */}
          <div className="flex flex-col gap-4 lg:flex-1">

            {/* VEIL Token card */}
            <div className="card-glow-violet rounded-2xl border border-violet-500/15 bg-[#0a0a14] p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="token-float flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10 text-violet-300">
                  <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <circle cx="10" cy="10" r="8"/>
                    <path d="M7 10h6M10 7v6"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-white">VEIL Token</p>
                  <p className="text-xs text-zinc-600">ERC-7984 Confidential Reward</p>
                </div>
                <a
                  href={`https://sepolia.arbiscan.io/address/${TOKEN}`}
                  target="_blank" rel="noopener noreferrer"
                  className="ml-auto text-[10px] text-violet-500 underline underline-offset-2"
                >
                  View ↗
                </a>
              </div>
              <div className="space-y-2">
                {[
                  { k: "Standard",  v: "ERC-7984" },
                  { k: "Balances",  v: "Encrypted on-chain" },
                  { k: "Reward",    v: "1 VEIL per intent" },
                  { k: "Faucet",    v: "10 VEIL (once)" },
                ].map(({ k, v }) => (
                  <div key={k} className="flex items-center justify-between rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2">
                    <span className="text-xs text-zinc-600">{k}</span>
                    <span className="text-xs font-medium text-violet-300">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* TEE attestation card */}
            <div className="card-glow rounded-2xl border border-white/[0.07] bg-[#0a0a14] p-6">
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-500/[0.06] text-cyan-400">
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M8 1l5.5 2v4.5c0 3-2.2 5.8-5.5 6.8C5.2 13.3 3 10.5 3 7.5V3L8 1z"/>
                  </svg>
                </div>
                <p className="text-sm font-semibold text-white">TEE Attestation</p>
              </div>
              <div className="relative overflow-hidden rounded-lg border border-white/[0.05] bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-zinc-500">
                <div className="beam-scan absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />
                <p><span className="text-cyan-400">gateway</span>  <span className="text-zinc-600">→</span> iExec Nox TDX KMS</p>
                <p><span className="text-violet-400">enclave</span> <span className="text-zinc-600">→</span> Intel SGX worker</p>
                <p><span className="text-emerald-400">result</span>  <span className="text-zinc-600">→</span> on-chain ebool</p>
                <p><span className="text-yellow-400">token</span>   <span className="text-zinc-600">→</span> euint256 balance</p>
              </div>
            </div>

            {/* Links */}
            <div className="rounded-xl border border-white/[0.05] bg-[#0a0a14] p-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-700">Resources</p>
              <div className="flex flex-col gap-1.5">
                {[
                  { label: "iExec Nox Docs",        href: "https://docs.iex.ec/nox-protocol" },
                  { label: "Confidential Token Demo", href: "https://cdefi.iex.ec" },
                  { label: "DoraHacks submission",   href: "https://dorahacks.io/hackathon/vibe-coding-iexec" },
                  { label: "GitHub",                 href: "https://github.com" },
                ].map(({ label, href }) => (
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2 text-xs text-zinc-500 transition hover:border-violet-500/20 hover:text-zinc-300"
                  >
                    {label}
                    <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1.5 8.5l7-7M3 1.5h5v5"/>
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section id="how" className="relative z-10 border-t border-white/[0.04] py-24">
        <div className="mx-auto max-w-5xl px-5">
          <div className="mb-12 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-700">Protocol</p>
            <h2 className="mt-2 text-2xl font-black text-white">Confidential by design</h2>
            <p className="mt-2 text-sm text-zinc-600">Four layers of privacy — from your browser to the blockchain</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                n: "01", title: "Parse",
                desc: "ChainGPT extracts your intent from natural language — action, asset, and price condition.",
                color: "indigo",
                icon: <path d="M2 4h12M2 8h8M2 12h5" strokeLinecap="round"/>,
              },
              {
                n: "02", title: "Encrypt",
                desc: "Your threshold is sealed in the Nox Gateway — a KMS backed by Intel TDX. Plaintext never leaves your device.",
                color: "violet",
                icon: <><rect x="2" y="7" width="12" height="8" rx="1.5"/><path d="M5 7V5a3 3 0 016 0v2" strokeLinecap="round"/></>,
              },
              {
                n: "03", title: "Evaluate",
                desc: "VeilExecutor triggers a confidential comparison inside an SGX enclave via Nox.lt() / Nox.gt(). No observer ever sees your threshold.",
                color: "cyan",
                icon: <><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2.5" strokeLinecap="round"/></>,
              },
              {
                n: "04", title: "Reward",
                desc: "The boolean result is published on-chain. You earn 1 VEIL — an ERC-7984 confidential token — with a hidden balance only you can decrypt.",
                color: "emerald",
                icon: <><circle cx="12" cy="12" r="8"/><path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/></>,
              },
            ].map(({ n, title, desc, color, icon }) => {
              const colors: Record<string, string> = {
                indigo:  "border-indigo-500/20 bg-indigo-500/[0.06] text-indigo-400",
                violet:  "border-violet-500/20 bg-violet-500/[0.06] text-violet-400",
                cyan:    "border-cyan-500/20   bg-cyan-500/[0.06]   text-cyan-400",
                emerald: "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400",
              };
              return (
                <div key={n} className="card-glow rounded-2xl border border-white/[0.07] bg-[#0a0a14] p-6 transition-all duration-300 hover:border-white/[0.12] hover:-translate-y-0.5">
                  <div className={`mb-4 flex h-9 w-9 items-center justify-center rounded-xl border ${colors[color]}`}>
                    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.5">{icon}</svg>
                  </div>
                  <p className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-zinc-700">Step {n}</p>
                  <p className="mb-2 text-sm font-bold text-white">{title}</p>
                  <p className="text-xs leading-relaxed text-zinc-600">{desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/[0.04] py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="Veil" width={18} height={18} className="rounded opacity-30" />
            <span className="text-xs text-zinc-700">© 2025 Veil · Built with iExec Nox</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {[
              { label: "VeilExecutor",  href: `https://sepolia.arbiscan.io/address/${CONTRACT}` },
              { label: "VeilToken",     href: `https://sepolia.arbiscan.io/address/${TOKEN}`    },
              { label: "iExec Nox",     href: "https://docs.iex.ec/nox-protocol"                },
              { label: "DoraHacks",     href: "https://dorahacks.io/hackathon/vibe-coding-iexec" },
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

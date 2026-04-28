import { ConnectButton } from "./components/ConnectButton";
import { IntentForm } from "./components/IntentForm";

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col px-4 py-8">

        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xl font-bold tracking-tight text-white">Veil</p>
            <p className="text-xs text-zinc-500">Confidential Intent Execution Layer</p>
          </div>
          <ConnectButton />
        </header>

        {/* Divider */}
        <div className="my-8 h-px bg-white/5" />

        {/* Network badge */}
        <div className="mb-6 inline-flex items-center gap-2 self-start rounded-full border border-violet-500/20 bg-violet-500/5 px-3 py-1 text-xs text-violet-400">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
          Arbitrum Sepolia · TEE-secured
        </div>

        {/* Hero */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Trade without{" "}
            <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
              revealing intent
            </span>
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Your strategy is encrypted inside a TEE. No one sees the condition — only the result.
          </p>
        </div>

        {/* Form + Status */}
        <IntentForm />

      </div>
    </div>
  );
}

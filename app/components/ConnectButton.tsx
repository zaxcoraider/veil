"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const [hovered, setHovered] = useState(false);

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-1.5 sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-emerald-400 font-medium">Connected</span>
        </div>
        <button
          onClick={() => disconnect()}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-1.5 text-sm font-mono transition-all duration-200 hover:border-red-500/30 hover:bg-red-500/5 hover:text-red-400 text-zinc-300"
        >
          {hovered ? "Disconnect" : `${address.slice(0, 6)}…${address.slice(-4)}`}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => connect({ connector: injected() })}
      className="btn-shimmer rounded-lg px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition-all duration-200 active:scale-95"
    >
      Connect Wallet
    </button>
  );
}

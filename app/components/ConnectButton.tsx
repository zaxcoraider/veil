"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect }    = useConnect();
  const { disconnect } = useDisconnect();
  const [hovered, setHovered] = useState(false);

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3.5 py-1.5 text-sm font-mono transition-all duration-200 hover:border-red-500/30 hover:bg-red-500/[0.06] hover:text-red-400 text-zinc-300"
      >
        {hovered ? "Disconnect" : `${address.slice(0, 6)}…${address.slice(-4)}`}
      </button>
    );
  }

  return (
    <button
      onClick={() => connect({ connector: injected() })}
      className="btn-shimmer rounded-lg px-4 py-1.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition-all duration-200 active:scale-95"
    >
      Connect Wallet
    </button>
  );
}

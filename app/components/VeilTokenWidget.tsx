"use client";

import { useState, useEffect } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import {
  VEIL_TOKEN_ABI,
  getEncryptedBalanceHandle,
  decryptVeilBalance,
  claimFaucet,
  hasClaimed as checkHasClaimed,
  formatVeil,
  isUninitialized,
} from "@/lib/veilToken";

const TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_VEIL_TOKEN ?? "") as `0x${string}`;

type BalanceState = "idle" | "loading" | "encrypted" | "decrypting" | "revealed" | "error";

export function VeilTokenWidget({ onBalanceUpdate }: { onBalanceUpdate?: (bal: string) => void }) {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [state, setState]           = useState<BalanceState>("idle");
  const [balance, setBalance]       = useState<string | null>(null);
  const [claimed, setClaimed]       = useState(false);
  const [claiming, setClaiming]     = useState(false);
  const [claimTx, setClaimTx]       = useState<string | null>(null);
  const [handle, setHandle]         = useState<`0x${string}` | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [decryptHint, setDecryptHint] = useState<string>("Sign in wallet…");

  useEffect(() => {
    if (!isConnected || !address || !publicClient || !TOKEN_ADDRESS) return;
    loadBalance();
    checkHasClaimed(publicClient, TOKEN_ADDRESS, address).then(setClaimed).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address]);

  async function loadBalance() {
    if (!address || !publicClient || !TOKEN_ADDRESS) return;
    setState("loading");
    try {
      const h = await getEncryptedBalanceHandle(publicClient, TOKEN_ADDRESS, address);
      setHandle(h);
      setState(isUninitialized(h) ? "idle" : "encrypted");
    } catch {
      setState("error");
    }
  }

  async function revealBalance() {
    if (!walletClient || !handle) return;
    setState("decrypting");
    setDecryptHint("Sign in wallet…");
    setError(null);
    // Hints shown after 4s and 10s to indicate gateway sync wait
    const hints = [
      { delay: 4000,  text: "Waiting for gateway…" },
      { delay: 15000, text: "Gateway indexing ACL (~30s)…" },
      { delay: 35000, text: "Almost there…" },
    ];
    const timers = hints.map(({ delay, text }) =>
      setTimeout(() => setDecryptHint(text), delay)
    );
    try {
      const raw = await decryptVeilBalance(walletClient, handle);
      timers.forEach(clearTimeout);
      setBalance(formatVeil(raw));
      setState("revealed");
      onBalanceUpdate?.(formatVeil(raw));
    } catch (e) {
      timers.forEach(clearTimeout);
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[VeilTokenWidget] decrypt failed:", e);
      setError(msg.length > 80 ? msg.slice(0, 80) + "…" : msg);
      setState("encrypted");
    }
  }

  async function handleFaucet() {
    if (!walletClient || !publicClient || !address || !TOKEN_ADDRESS) return;
    setClaiming(true);
    setError(null);
    try {
      const tx = await claimFaucet(walletClient, publicClient, TOKEN_ADDRESS);
      setClaimTx(tx);
      setClaimed(true);
      await loadBalance();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setClaiming(false);
    }
  }

  if (!isConnected || !TOKEN_ADDRESS) return null;

  return (
    <div className="flex items-center gap-2">
      {/* Balance pill */}
      <div className="flex items-center gap-1.5 rounded-full border border-violet-500/20 bg-violet-500/[0.06] px-3 py-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-violet-500">VEIL</span>
        <span className="mx-1 h-3 w-px bg-violet-500/20" />
        {state === "idle" && (
          <span className="text-xs text-zinc-600">—</span>
        )}
        {state === "loading" && (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-violet-500/30 border-t-violet-400" />
        )}
        {state === "encrypted" && (
          <button
            onClick={revealBalance}
            className="flex items-center gap-1 text-xs text-violet-400 transition hover:text-violet-200"
            title="Click to decrypt your balance"
          >
            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="1.5" y="5" width="9" height="6" rx="1"/>
              <path d="M4 5V3.5a2 2 0 014 0V5" strokeLinecap="round"/>
            </svg>
            Reveal
          </button>
        )}
        {state === "decrypting" && (
          <span className="flex items-center gap-1 text-xs text-violet-400" title="Approve the MetaMask signature then wait for the gateway">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-violet-500/30 border-t-violet-400" />
            {decryptHint}
          </span>
        )}
        {state === "revealed" && balance !== null && (
          <span className="text-xs font-bold text-white">{balance}</span>
        )}
        {state === "error" && (
          <span className="text-xs text-red-400">!</span>
        )}
      </div>

      {/* Faucet button — only if not yet claimed */}
      {!claimed && (
        <button
          onClick={handleFaucet}
          disabled={claiming}
          title="Claim 10 free VEIL tokens"
          className="flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-400 transition hover:border-emerald-500/40 hover:bg-emerald-500/10 disabled:opacity-50"
        >
          {claiming ? (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400" />
          ) : (
            <>
              <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M6 1v10M1 6h10"/>
              </svg>
              Claim VEIL
            </>
          )}
        </button>
      )}

      {claimTx && (
        <a
          href={`https://sepolia.arbiscan.io/tx/${claimTx}`}
          target="_blank" rel="noopener noreferrer"
          className="text-[10px] text-emerald-500 underline underline-offset-2"
        >
          Claimed ↗
        </a>
      )}

      {error && <span className="text-[10px] text-red-400">{error}</span>}
    </div>
  );
}

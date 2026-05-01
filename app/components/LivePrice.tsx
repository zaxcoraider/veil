"use client";

import { useState, useEffect } from "react";

export function LivePrice() {
  const [price, setPrice] = useState<number | null>(null);
  const [prev,  setPrev]  = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetch_() {
      try {
        const res  = await fetch("/api/price");
        if (!res.ok) return;
        const data = await res.json() as { price: number };
        if (!mounted) return;
        setPrev(p => p ?? data.price);
        setPrice(prev_ => {
          setPrev(prev_);
          return data.price;
        });
      } catch { /* ignore */ }
    }

    fetch_();
    const id = setInterval(fetch_, 30_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  if (!price) return null;

  const up = prev === null || price >= prev;

  return (
    <div className="hidden items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs sm:flex">
      <span className="text-zinc-600">ETH</span>
      <span className={`font-mono font-semibold transition-colors duration-500 ${up ? "text-emerald-400" : "text-red-400"}`}>
        ${price.toLocaleString()}
      </span>
      <span className={`text-[10px] ${up ? "text-emerald-500" : "text-red-500"}`}>{up ? "▲" : "▼"}</span>
    </div>
  );
}

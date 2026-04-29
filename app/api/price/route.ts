import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { next: { revalidate: 30 } }
    );
    if (!res.ok) throw new Error(`CoinGecko status ${res.status}`);
    const data = (await res.json()) as { ethereum: { usd: number } };
    return NextResponse.json({ price: data.ethereum.usd, source: "coingecko" });
  } catch {
    // Fallback to CoinCap if CoinGecko is down
    try {
      const fallback = await fetch("https://api.coincap.io/v2/assets/ethereum");
      if (!fallback.ok) throw new Error("CoinCap failed");
      const fb = (await fallback.json()) as { data: { priceUsd: string } };
      return NextResponse.json({
        price: Math.round(parseFloat(fb.data.priceUsd)),
        source: "coincap",
      });
    } catch {
      return NextResponse.json({ error: "Price fetch failed" }, { status: 500 });
    }
  }
}

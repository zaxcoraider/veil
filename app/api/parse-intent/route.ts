import { NextRequest, NextResponse } from "next/server";

type ParsedIntent = {
  action: string;
  asset: string;
  amount: string;
  condition: string;
};

// ── ChainGPT ──────────────────────────────────────────────────────────────────

const CHAINGPT_PROMPT = (intent: string, amount: string) =>
  `You are a trading intent parser for a DeFi app. Parse the user's intent and return ONLY a valid JSON object with exactly these fields:
- action: "buy" or "sell"
- asset: token symbol (e.g. "ETH", "BTC", "ARB")
- amount: USDC amount as a string (use "${amount}" if not specified in the intent)
- condition: price condition in exact format "price < NUMBER" or "price > NUMBER"

User intent: "${intent}"
Amount: ${amount} USDC

Return ONLY the JSON object, no markdown, no explanation.
Example: {"action":"buy","asset":"ETH","amount":"100","condition":"price < 2000"}`;

async function parseWithChainGPT(
  intent: string,
  amount: string
): Promise<ParsedIntent | null> {
  const apiKey = process.env.CHAINGPT_API_KEY;
  if (!apiKey) {
    console.log("[parse-intent] No CHAINGPT_API_KEY — using mock parser");
    return null;
  }

  try {
    const res = await fetch("https://api.chaingpt.org/chat/stream", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: CHAINGPT_PROMPT(intent, amount),
        useCustomContext: false,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[parse-intent] ChainGPT HTTP ${res.status}: ${body}`);
      return null;
    }

    // Collect streaming response
    const raw = await res.text();
    console.log("[parse-intent] ChainGPT raw response:", raw.slice(0, 300));

    // Strip SSE "data: " prefixes if present, then join
    const text = raw
      .split("\n")
      .filter((l) => l.startsWith("data:") || l.startsWith("{"))
      .map((l) => l.replace(/^data:\s*/, "").trim())
      .filter((l) => l && l !== "[DONE]")
      .join("");

    // Extract JSON object from text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[parse-intent] ChainGPT response has no JSON object. Full text:", text.slice(0, 500));
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as ParsedIntent;
    if (!parsed.action || !parsed.asset || !parsed.condition) {
      console.error("[parse-intent] ChainGPT JSON missing required fields:", parsed);
      return null;
    }

    console.log("[parse-intent] ChainGPT parsed successfully:", parsed);
    return parsed;
  } catch (err) {
    console.error("[parse-intent] ChainGPT exception:", err);
    return null;
  }
}

// ── Mock fallback parser ──────────────────────────────────────────────────────

const KNOWN_ASSETS = ["ETH", "BTC", "ARB", "MATIC", "USDC", "SOL"];

function parseWithMock(intent: string, amount: string): ParsedIntent {
  const text = intent.toLowerCase();

  const action = text.includes("sell") ? "sell" : "buy";
  const asset = KNOWN_ASSETS.find((a) => text.includes(a.toLowerCase())) ?? "ETH";

  const priceMatch = text.match(/(\d+(?:\.\d+)?)/);
  const price = priceMatch ? priceMatch[1] : "2000";
  const operator =
    text.includes("above") || text.includes("over") || text.includes("exceeds")
      ? ">"
      : "<";

  const amountMatch = text.match(/(\d+)\s*(?:usdc|dollars?|\$)/i);
  const parsedAmount = amountMatch ? amountMatch[1] : amount || "100";

  return { action, asset, amount: parsedAmount, condition: `price ${operator} ${price}` };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body?.intent || typeof body.intent !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid 'intent' field" },
      { status: 400 }
    );
  }

  const { intent, amount = "100" } = body as { intent: string; amount: string };

  // Try ChainGPT first; fall back to mock if key missing or request fails
  const cgptResult = await parseWithChainGPT(intent, amount);
  const source = cgptResult ? "chaingpt" : "mock";
  const result = cgptResult ?? parseWithMock(intent, amount);

  return NextResponse.json({ ...result, source });
}

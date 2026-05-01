// ── Types ─────────────────────────────────────────────────────────────────────

export type ExplainInput = {
  action:    "buy" | "sell";
  asset:     string;
  operator:  "<" | ">";
  threshold: number;
  price:     number;
  execute:   boolean;
};

// ── Template-based explanation ─────────────────────────────────────────────────
//
// One ChainGPT call (parse) is already in the pipeline.
// Explanation is template-based to keep API usage minimal.

export function generateExplanation(input: ExplainInput): string {
  const { action, asset, operator, threshold, price, execute } = input;

  const fmt = (n: number) => `$${n.toLocaleString()}`;
  const moved = operator === "<" ? "dropped below" : "rose above";
  const waiting = operator === "<" ? "hasn't dropped below" : "hasn't risen above";

  if (execute) {
    return (
      `Trade executed — ${asset} price (${fmt(price)}) ${moved} ` +
      `your ${fmt(threshold)} threshold. ` +
      `Your ${action} order was triggered by the TEE.`
    );
  }

  return (
    `Trade held — ${asset} price (${fmt(price)}) ${waiting} ` +
    `your ${fmt(threshold)} threshold. ` +
    `TEE result is final — settle to return your VEIL.`
  );
}

// Tracks the AI tokens THIS tool spends (from each API response's usage field)
// and estimates cost. The real credit balance lives only in the provider console;
// this gives an accurate running total of what AMS itself consumed. Stored locally.
import fs from "node:fs";
const FILE = "ai-usage.json";

// Rough list prices, USD per 1,000,000 tokens (input / output). Approximate —
// providers change these; the card labels the figure as an estimate.
const PRICES = {
  haiku:  { in: 0.80, out: 4.00 },
  sonnet: { in: 3.00, out: 15.00 },
  opus:   { in: 15.00, out: 75.00 },
  "gpt-4o-mini": { in: 0.15, out: 0.60 },
  "gpt-4o": { in: 2.50, out: 10.00 },
  default: { in: 1.00, out: 5.00 },
};
function tierOf(model) {
  const m = (model || "").toLowerCase();
  if (m.includes("haiku")) return "haiku";
  if (m.includes("sonnet")) return "sonnet";
  if (m.includes("opus")) return "opus";
  if (m.includes("4o-mini")) return "gpt-4o-mini";
  if (m.includes("gpt-4o")) return "gpt-4o";
  return "default";
}

export function loadUsage() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); }
  catch { return { calls: 0, inputTokens: 0, outputTokens: 0, costUSD: 0, byModel: {}, since: null }; }
}
export function recordUsage({ model, input = 0, output = 0 }) {
  const u = loadUsage();
  const p = PRICES[tierOf(model)] || PRICES.default;
  const cost = (input / 1e6) * p.in + (output / 1e6) * p.out;
  u.calls += 1; u.inputTokens += input; u.outputTokens += output; u.costUSD += cost;
  u.byModel[model] = u.byModel[model] || { calls: 0, input: 0, output: 0, costUSD: 0 };
  const m = u.byModel[model];
  m.calls += 1; m.input += input; m.output += output; m.costUSD += cost;
  if (!u.since) u.since = new Date().toISOString();
  try { fs.writeFileSync(FILE, JSON.stringify(u)); } catch { /* ignore */ }
  return u;
}
export function resetUsage() { try { fs.unlinkSync(FILE); } catch { /* ignore */ } }

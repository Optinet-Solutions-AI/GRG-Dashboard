import type { QuestionId } from "./types";

// Tokenless intent matching: map a free-text question to the closest built-in
// answer by keyword overlap. No LLM — bounded to the questions we can answer.
const INTENTS: { id: QuestionId; keywords: string[] }[] = [
  { id: "ranking-changes", keywords: ["rank", "ranking", "position", "moved", "move", "changed", "change", "week", "improved", "improve", "dropped", "drop", "gain", "fell", "keyword", "top 10", "top 100"] },
  { id: "top-mover-week", keywords: ["top mover", "improved most", "best site", "most improved", "biggest mover"] },
  { id: "missing-or-stale", keywords: ["missing", "stale", "outdated", "old data", "not updated", "needs update", "out of date", "fresh"] },
  { id: "pagespeed-trend", keywords: ["pagespeed", "page speed", "speed", "performance", "lighthouse", "load"] },
  { id: "health-summary", keywords: ["health", "domain rating", "organic", "traffic", "referring", "ahrefs", "backlink"] },
];

/** Map free text to the closest built-in question id, or null if nothing matches. */
export function matchQuestion(text: string): QuestionId | null {
  const t = ` ${text.toLowerCase()} `;
  let best: { id: QuestionId; score: number } | null = null;
  for (const intent of INTENTS) {
    const score = intent.keywords.reduce((s, k) => s + (t.includes(k) ? 1 : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { id: intent.id, score };
  }
  return best?.id ?? null;
}

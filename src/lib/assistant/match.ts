import type { QuestionId } from "./types";

// Tokenless intent matching: map a free-text question to the closest built-in
// answer. No LLM — every answer is COMPUTED from live data, but the set of
// questions is bounded. Multi-word phrases score higher (more specific), and
// more specific intents are listed first so they win ties over the broad
// "ranking-changes" catch-all.
const INTENTS: { id: QuestionId; keywords: string[] }[] = [
  { id: "focus-keywords", keywords: ["focus", "prioriti", "work on", "what to work", "which keyword", "what keyword", "target keyword", "weak", "worst", "lowest", "poor rank", "needs work", "should i improve", "what should i", "where to improve"] },
  { id: "backlinks-summary", keywords: ["backlink", "back link", "link building", "links built", "referring domain", "how many link", "indexed link", "number of link", "total link", "build link", "link profile"] },
  { id: "seo-summary", keywords: ["seo score", "on-page", "onpage", "on page seo", "seo health", "rankmath", "seo audit", "seo result", "my seo", "seo status", "how is my seo"] },
  { id: "top-mover-week", keywords: ["top mover", "improved most", "best site", "most improved", "biggest mover", "which site improved", "best performer"] },
  { id: "missing-or-stale", keywords: ["missing", "stale", "outdated", "old data", "not updated", "needs update", "out of date", "fresh", "up to date", "last updated", "how fresh"] },
  { id: "pagespeed-trend", keywords: ["pagespeed", "page speed", "speed", "performance", "lighthouse", "load time", "core web", "loading"] },
  { id: "health-summary", keywords: ["health", "domain rating", "domain authority", "organic", "traffic", "ahrefs", "visibility", "overall site"] },
  { id: "ranking-changes", keywords: ["rank", "ranking", "position", "moved", "move", "changed", "change", "week", "improved", "improve", "dropped", "drop", "gain", "fell", "keyword", "top 10", "top 100"] },
];

function scoreIntent(text: string, keywords: string[]): number {
  let s = 0;
  for (const k of keywords) {
    if (text.includes(k)) s += k.includes(" ") || k.includes("-") ? 2 : 1; // phrases are stronger signals
  }
  return s;
}

/** Map free text to the closest built-in question id, or null if nothing matches. */
export function matchQuestion(text: string): QuestionId | null {
  const t = ` ${text.toLowerCase()} `;
  let best: { id: QuestionId; score: number } | null = null;
  for (const intent of INTENTS) {
    const score = scoreIntent(t, intent.keywords);
    if (score > 0 && (!best || score > best.score)) best = { id: intent.id, score };
  }
  return best?.id ?? null;
}

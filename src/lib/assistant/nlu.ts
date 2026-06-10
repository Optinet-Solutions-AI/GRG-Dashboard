// Tokenless natural-language understanding for the assistant. Pure functions,
// no model, no network — we parse a free-text question into a structured query
// the answer engine can execute against live data. Because every answer is then
// COMPUTED from the database, the assistant cannot hallucinate numbers.

export type Topic = "ranking" | "backlinks" | "pagespeed" | "seo" | "health" | "qa" | "freshness" | "focus";
export type Direction = "up" | "down";
export type Extreme = "best" | "worst";

export interface ParsedQuery {
  topics: Topic[];
  country: string | null; // resolved country code present in the data
  keyword: string | null; // exact keyword string from the vocab
  direction: Direction | null;
  extreme: Extreme | null;
  comparison: boolean;
  count: boolean;
  greeting: boolean;
}

// name/abbreviation -> country code used in the data
const COUNTRY_SYNONYMS: Record<string, string> = {
  "saudi arabia": "SA", saudi: "SA", ksa: "SA", "sa": "SA",
  uae: "AE", emirates: "AE", "u.a.e": "AE", dubai: "AE", "abu dhabi": "AE", "ae": "AE",
  qatar: "QA", doha: "QA", "qa": "QA",
  oman: "OM", muscat: "OM", "om": "OM",
  kuwait: "KW", "kw": "KW",
  bahrain: "BH", manama: "BH", "bh": "BH",
};

const TOPIC_KEYWORDS: { topic: Topic; words: string[] }[] = [
  { topic: "freshness", words: ["stale", "fresh", "outdated", "out of date", "up to date", "last updated", "missing data", "not updated", "needs update", "how old", "data old"] },
  { topic: "focus", words: ["focus", "prioriti", "work on", "what to work", "where to improve", "should i improve", "what should i", "needs work", "weakest", "low hanging", "quick win", "opportunit"] },
  // pagespeed: includes mobile/desktop (the only metric split that way) and common
  // speech-to-text / typo variants of "page speed" (page feed, pagefeed, page-speed).
  { topic: "pagespeed", words: ["pagespeed", "page speed", "page-speed", "page feed", "pagefeed", "site speed", "speed", "lighthouse", "load time", "loading", "core web", "web vital", "performance score", "psi", "mobile", "desktop"] },
  { topic: "backlinks", words: ["backlink", "back link", "link building", "links built", "referring domain", "anchor", "link profile", "off-page", "off page", "linking", "links"] },
  { topic: "seo", words: ["seo score", "on-page", "onpage", "on page", "rankmath", "seo audit", "seo health", "my seo", "seo status", "technical seo", "seo result"] },
  { topic: "health", words: ["health", "domain rating", "domain authority", "organic traffic", "organic keyword", "traffic", "ahrefs", "visibility", " dr ", "authority"] },
  { topic: "qa", words: [" qa ", "checklist", "quality assurance", "qa page", "pages crawled", "page check", "brand protection", "indexed", "index status", "pages indexed", "not indexed", "canonical", "html lang", "meta description", "h1", "audit page", "page audit", "seo issue", "ar issue", "alt tag", "missing alt"] },
  { topic: "ranking", words: ["rank", "ranking", "position", "serp", "keyword", "top 10", "top ten", "top 3", "top three", "top 100", "page one", "page 1", "google", "search result", "week", "changed", "moved", "movement"] },
];

function has(t: string, ...needles: string[]): boolean {
  return needles.some((n) => t.includes(n));
}

function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[?!.,;:()"']/g, " ").replace(/\s+/g, " ")} `;
}

function detectCountry(t: string, validCodes: string[]): string | null {
  // Prefer the longest synonym match so "saudi arabia" beats "sa".
  const hits: { code: string; len: number }[] = [];
  for (const [name, code] of Object.entries(COUNTRY_SYNONYMS)) {
    if (!validCodes.includes(code)) continue;
    const needle = name.length <= 2 ? ` ${name} ` : name; // 2-letter codes need word boundaries
    if (t.includes(needle)) hits.push({ code, len: name.length });
  }
  if (hits.length === 0) return null;
  hits.sort((a, b) => b.len - a.len);
  return hits[0].code;
}

function detectKeyword(t: string, keywords: string[]): string | null {
  let best: string | null = null;
  for (const kw of keywords) {
    const k = kw.toLowerCase().trim();
    if (k.length >= 3 && t.includes(k) && (!best || k.length > best.length)) best = kw;
  }
  return best;
}

export function parseQuery(text: string, vocab: { countryCodes: string[]; keywords: string[] }): ParsedQuery {
  const t = normalize(text);

  const topics: Topic[] = [];
  for (const { topic, words } of TOPIC_KEYWORDS) {
    if (words.some((w) => t.includes(w))) topics.push(topic);
  }
  // de-dup while keeping order
  const seen = new Set<Topic>();
  const orderedTopics = topics.filter((tp) => (seen.has(tp) ? false : (seen.add(tp), true)));

  const country = detectCountry(t, vocab.countryCodes);
  const keyword = detectKeyword(t, vocab.keywords);

  const direction: Direction | null = has(t, "improv", "gain", "rose", "climb", "went up", " up ", "moved up", "better", "increase")
    ? "up"
    : has(t, "drop", "fell", "fall", "declin", "lost", "went down", " down ", "worse", "decrease", "sank")
      ? "down"
      : null;

  const extreme: Extreme | null = has(t, "best", "highest", "strongest", "top performer", "top ranking", "winning")
    ? "best"
    : has(t, "worst", "lowest", "weakest", "poorest", "struggling", "underperform")
      ? "worst"
      : null;

  const comparison = has(t, " vs ", "versus", "compare", "comparison", "difference between", "mobile and desktop", "desktop and mobile");
  const count = has(t, "how many", "number of", " count", "how much", "total number");
  // "how many pages" with no other topic → QA
  if (orderedTopics.length === 0 && count && has(t, " page")) orderedTopics.push("qa");
  const greeting = has(t, " hi ", " hello ", " hey ", "thank", "good morning", "good afternoon", "good evening", "what can you do", "help me", " who are you");

  // A bare "compare … mobile/desktop" with no topic is a PageSpeed question.
  if (orderedTopics.length === 0 && comparison) orderedTopics.push("pagespeed");
  // A bare country / keyword / direction / extreme with no explicit topic almost
  // always refers to keyword rankings in this product.
  if (orderedTopics.length === 0 && (country || keyword || direction || extreme)) {
    orderedTopics.push("ranking");
  }

  return { topics: orderedTopics, country, keyword, direction, extreme, comparison, count, greeting };
}

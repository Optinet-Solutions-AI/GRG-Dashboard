# Assistant Intelligence Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the tokenless SEO Assistant robust to typos/word-variants and able to list actual problem URLs, whole-site checklist status, and ranking drill-downs — then prove it with an 80–120 question eval and deploy.

**Architecture:** Keep the proven `parse → compute from DB` split. Add a pure text layer (stemmer + Levenshtein fuzzy match) so single-word triggers tolerate variants; add slots (filter/threshold/list/url/notRanking) to `ParsedQuery`; extract pure answer-formatters into `answers.ts` (testable without a DB) and add new ones; wire `smart.ts` to fetch + delegate. Eval files are the live-readiness gate.

**Tech Stack:** TypeScript, Next.js 16 server actions, Supabase JS, Vitest (jsdom, `server-only` stubbed in tests).

**Live-readiness gate:** `npm run test` all green with `nlu.eval.test.ts` ≥95% pass, `tsc --noEmit` + `npm run build` clean, browser smoke test passes → push `master` → Vercel auto-deploys `grg-dashboard.vercel.app`.

---

## File Structure

- **Create** `src/lib/assistant/text.ts` — pure string utils: `normalize`, `tokenize`, `stem`, `levenshtein`, `fuzzyEq`. No imports, no `server-only`.
- **Create** `src/lib/assistant/text.test.ts` — unit tests for the above.
- **Modify** `src/lib/assistant/nlu.ts` — hybrid matcher (phrase substring + single-word stem/fuzzy), new `checklist` topic, new slots on `ParsedQuery`. Stays pure.
- **Modify** `src/lib/assistant/nlu.test.ts` — keep all existing cases green (no edits expected; verify).
- **Create** `src/lib/assistant/nlu.eval.test.ts` — 80–120 labelled cases; the gate.
- **Create** `src/lib/assistant/answers.ts` — pure formatters: moved `rankingAnswer`/`focusAnswer` (+ drill-downs), new `qaPagesAnswer`, `qaPageDetail`, `siteChecklistAnswer`, `fallbackMessage`, shared helpers (`COUNTRY_NAME`, `cname`, `bullets`, row types). No `server-only`.
- **Modify** `src/lib/assistant/smart.ts` — import formatters from `answers.ts`; fetch `qa_page_audit`/`qa_site_audit` and route QA → per-page vs aggregate vs checklist; fallback uses `fallbackMessage`.
- **Create** `src/lib/assistant/smart.eval.test.ts` — answer-shape tests against synthetic rows (calls `answers.ts` directly).

---

## Task 1: Pure text layer (stemmer + fuzzy)

**Files:**
- Create: `src/lib/assistant/text.ts`
- Test: `src/lib/assistant/text.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/assistant/text.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { normalize, tokenize, stem, levenshtein, fuzzyEq } from "./text";

describe("text utils", () => {
  it("normalizes and tokenizes", () => {
    expect(tokenize("What pages are NOT index?")).toEqual(["what", "pages", "are", "not", "index"]);
    expect(normalize("a, b.")).toBe(" a b ");
  });

  it("stems plural/verb variants to a shared stem", () => {
    expect(stem("indexed")).toBe("index");
    expect(stem("indexing")).toBe("index");
    expect(stem("index")).toBe("index");
    expect(stem("rankings")).toBe("rank");
    expect(stem("ranking")).toBe("rank");
    expect(stem("pages")).toBe("page");
    expect(stem("backlinks")).toBe("backlink");
    expect(stem("issues")).toBe("issue");
    expect(stem("images")).toBe("image");
  });

  it("leaves short words and Arabic untouched", () => {
    expect(stem("is")).toBe("is");
    expect(stem("seo")).toBe("seo");
    expect(stem("التداول")).toBe("التداول");
  });

  it("levenshtein counts edits", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("backlink", "baklink")).toBe(1);
  });

  it("fuzzyEq matches typos on long words but not short ones", () => {
    expect(fuzzyEq("pagespeed", "pagepseed")).toBe(true); // transposition
    expect(fuzzyEq("backlink", "baklink")).toBe(true);
    expect(fuzzyEq("seo", "ceo")).toBe(false);            // too short to fuzz
    expect(fuzzyEq("health", "weather")).toBe(false);     // too different
  });
});
```

- [ ] **Step 2: Run it, confirm it fails** — `npm run test -- text.test` → FAIL (module not found).

- [ ] **Step 3: Implement** — `src/lib/assistant/text.ts`

```ts
// Pure string utilities for the tokenless NLU. No network, no model — unit-testable.

/** Lowercase, strip punctuation, collapse whitespace, pad with spaces for boundary checks. */
export function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[?!.,;:()"'`’]/g, " ").replace(/\s+/g, " ")} `;
}

/** Word tokens from text. Arabic preserved (only ASCII punctuation is stripped). */
export function tokenize(text: string): string[] {
  return normalize(text).trim().split(" ").filter(Boolean);
}

/** Light English suffix stripper, applied iteratively until stable. Leaves non-ASCII
 *  (Arabic) and short stems untouched, so it never mangles entities. */
export function stem(token: string): string {
  if (!/^[a-z]+$/.test(token)) return token;
  let t = token;
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of ["ing", "ed", "s"]) {
      if (t.endsWith(suf) && t.length - suf.length >= 3) {
        t = t.slice(0, -suf.length);
        changed = true;
        break;
      }
    }
  }
  return t;
}

/** Classic Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let cur = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/** True if two words are equal, or close enough to be a typo. Only fuzzes words with
 *  length >= 5 on BOTH sides (short words like seo/ceo must match exactly), with a
 *  distance budget of 1 (<=7 chars) or 2 (longer) and a small length gap. */
export function fuzzyEq(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5) return false;
  if (Math.abs(a.length - b.length) > 2) return false;
  const budget = Math.max(a.length, b.length) <= 7 ? 1 : 2;
  return levenshtein(a, b) <= budget;
}
```

- [ ] **Step 4: Run, confirm pass** — `npm run test -- text.test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/assistant/text.ts src/lib/assistant/text.test.ts
git commit -m "feat(assistant): pure text layer — stemmer + levenshtein fuzzy match"
```

---

## Task 2: Upgrade `nlu.ts` — hybrid matcher, checklist topic, slots

**Files:**
- Modify: `src/lib/assistant/nlu.ts`
- Verify (no edit): `src/lib/assistant/nlu.test.ts`

- [ ] **Step 1: Replace `nlu.ts` entirely** with the version below. It keeps every existing `ParsedQuery` field and behavior (superset), adds the `checklist` topic, the hybrid matcher, and new slots.

```ts
// Tokenless natural-language understanding for the assistant. Pure functions,
// no model, no network — we parse free text into a structured query the answer
// engine executes against live data. Because every answer is COMPUTED from the
// database, the assistant cannot hallucinate numbers.

import { normalize, tokenize, stem, fuzzyEq } from "./text";

export type Topic = "ranking" | "backlinks" | "pagespeed" | "seo" | "health" | "qa" | "checklist" | "freshness" | "focus";
export type Direction = "up" | "down";
export type Extreme = "best" | "worst";
export type PageFilter = "not-indexed" | "seo-issues" | "ar-issues" | "missing-alt" | "non-200";

export interface ParsedQuery {
  topics: Topic[];
  country: string | null;
  keyword: string | null;
  direction: Direction | null;
  extreme: Extreme | null;
  comparison: boolean;
  count: boolean;
  greeting: boolean;
  // slots (additive)
  filter: PageFilter | null;
  threshold: { kind: "top"; n: number } | null;
  list: boolean;
  url: string | null;
  notRanking: boolean;
}

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
  { topic: "checklist", words: ["checklist", "whole site", "whole website", "site setup", "schema", "structured data", "sitemap", "caching", "imagify", "site icon", "favicon", "search engine visibility", "google analytics", "meta tags", "nofollow"] },
  { topic: "pagespeed", words: ["pagespeed", "page speed", "page-speed", "page feed", "pagefeed", "site speed", "speed", "lighthouse", "load time", "loading", "core web", "web vital", "performance score", "psi", "mobile", "desktop"] },
  { topic: "backlinks", words: ["backlink", "back link", "link building", "links built", "referring domain", "anchor", "link profile", "off-page", "off page", "linking", "link"] },
  { topic: "seo", words: ["seo score", "on-page", "onpage", "on page", "rankmath", "seo audit", "seo health", "my seo", "seo status", "technical seo", "seo result"] },
  { topic: "health", words: ["health", "domain rating", "domain authority", "organic traffic", "organic keyword", "traffic", "ahrefs", "visibility", " dr ", "authority"] },
  { topic: "qa", words: [" qa ", "quality assurance", "qa page", "pages crawled", "page check", "brand protection", "indexed", "index status", "pages indexed", "not indexed", "canonical", "html lang", "meta description", "h1", "audit page", "page audit", "seo issue", "ar issue", "alt tag", "missing alt", "page"] },
  { topic: "ranking", words: ["rank", "ranking", "position", "serp", "keyword", "top 10", "top ten", "top 3", "top three", "top 100", "page one", "page 1", "google", "search result", "week", "changed", "moved", "movement"] },
];

function has(t: string, ...needles: string[]): boolean {
  return needles.some((n) => t.includes(n));
}

function detectCountry(t: string, validCodes: string[]): string | null {
  const hits: { code: string; len: number }[] = [];
  for (const [name, code] of Object.entries(COUNTRY_SYNONYMS)) {
    if (!validCodes.includes(code)) continue;
    const needle = name.length <= 2 ? ` ${name} ` : name;
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

// Hybrid trigger match: multi-word triggers use substring on normalized text
// (exact phrase, as before); single-word triggers match a stemmed token exactly
// or via fuzzy distance. Entities (countries/keywords) are matched EXACTLY
// elsewhere — never fuzzed — so a number is never attached to a wrong entity.
function triggerHit(word: string, t: string, stems: string[]): boolean {
  if (word.includes(" ") || word.includes("-")) return t.includes(word);
  const w = stem(word.trim());
  return stems.some((tok) => tok === w || fuzzyEq(tok, w));
}

export function parseQuery(text: string, vocab: { countryCodes: string[]; keywords: string[] }): ParsedQuery {
  const t = normalize(text);
  const stems = tokenize(text).map(stem);

  const topics: Topic[] = [];
  for (const { topic, words } of TOPIC_KEYWORDS) {
    if (words.some((w) => triggerHit(w, t, stems))) topics.push(topic);
  }
  const seen = new Set<Topic>();
  let orderedTopics = topics.filter((tp) => (seen.has(tp) ? false : (seen.add(tp), true)));

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

  // slots
  const list = has(t, "which", "list", "show me", "show the", "what page", "what pages", "name the", "give me the", "tell me which", "what are the");
  const negate = has(t, " not ", " no ", " aren t ", " arent ", " isn t ", " isnt ", "without", "missing", "non ", "un");

  let filter: PageFilter | null = null;
  if (has(t, "arabic", "alignment", " ar ", "rtl") && (stems.includes("issue") || has(t, "alignment"))) filter = "ar-issues";
  else if (has(t, "missing alt", "alt text", "alt tag", "no alt", "without alt") || (has(t, "alt") && negate)) filter = "missing-alt";
  else if (has(t, "broken", "404", "not 200", "non 200", "error page", "not live", " down page", "dead page")) filter = "non-200";
  else if (stems.includes("index") && (has(t, "not index", "no index", "unindex", "not in google", "missing from", "aren t index", "isn t index") || (negate && stems.includes("index")))) filter = "not-indexed";
  else if (has(t, "seo issue", "seo problem", "seo error") || (stems.includes("issue") && (stems.includes("page") || list))) filter = "seo-issues";

  let threshold: { kind: "top"; n: number } | null = null;
  const m = t.match(/top\s*(\d+)/);
  if (m) threshold = { kind: "top", n: Number(m[1]) };
  else if (has(t, "top three", "top 3")) threshold = { kind: "top", n: 3 };
  else if (has(t, "top ten", "top 10", "page one", "page 1", "first page")) threshold = { kind: "top", n: 10 };

  const urlMatch = text.match(/https?:\/\/\S+|\/[a-z0-9][a-z0-9\-/]*\/?/i);
  const url = urlMatch ? urlMatch[0] : null;

  const notRanking = (stems.includes("rank") || has(t, "ranking")) && has(t, "not rank", "not in top", "unranked", "aren t rank", "isn t rank", "not on google", "nowhere", "not ranking");

  const greeting = has(t, " hi ", " hello ", " hey ", "thank", "good morning", "good afternoon", "good evening", "what can you do", "help me", " who are you");

  if (orderedTopics.length === 0 && count && stems.includes("page")) orderedTopics.push("qa");
  if (orderedTopics.length === 0 && comparison) orderedTopics.push("pagespeed");
  if (orderedTopics.length === 0 && (country || keyword || direction || extreme)) orderedTopics.push("ranking");

  return { topics: orderedTopics, country, keyword, direction, extreme, comparison, count, greeting, filter, threshold, list, url, notRanking };
}
```

- [ ] **Step 2: Run existing NLU tests, confirm still green** — `npm run test -- nlu.test`
  Expected: all PASS (the new code is a superset). If `"what should I focus on in Qatar?"` regresses to include `qa`, confirm `" qa "` (spaced) is NOT in `"in qatar"` — it isn't, so it stays correct.

- [ ] **Step 3: Commit**

```bash
git add src/lib/assistant/nlu.ts
git commit -m "feat(assistant): hybrid matcher (stem+fuzzy), checklist topic, slots"
```

---

## Task 3: Eval harness — `nlu.eval.test.ts` (the gate)

**Files:**
- Create: `src/lib/assistant/nlu.eval.test.ts`

This is the "training" loop: run, inspect failures, fix the lexicon/stemmer/slots in `nlu.ts`, re-run until ≥95% pass. The dataset below covers clean phrasings, typos, ASR errors, Arabic, every metric, every QA filter, multi-topic, greetings, and out-of-domain negatives. **Expand to ≥80 cases** by adding rows in the same shape across the listed categories until the count is met; the set below establishes every pattern.

- [ ] **Step 1: Write the eval** — `src/lib/assistant/nlu.eval.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { parseQuery, type ParsedQuery } from "./nlu";

const VOCAB = {
  countryCodes: ["SA", "QA", "OM", "KW", "BH", "AE"],
  keywords: ["استرجاع أموال التداول", "احتيال منصات التداول"],
};
const p = (s: string) => parseQuery(s, VOCAB);

// Each case asserts a subset of the parse. `topicsInclude` = must contain;
// `topicsEmpty` = must be []. Other keys assert that slot exactly.
type Case = {
  q: string;
  topicsInclude?: ParsedQuery["topics"];
  topicsEmpty?: boolean;
  country?: string | null;
  filter?: ParsedQuery["filter"];
  threshold?: ParsedQuery["threshold"];
  notRanking?: boolean;
  comparison?: boolean;
  greeting?: boolean;
  keyword?: string | null;
};

const CASES: Case[] = [
  // ── the screenshot failure + index variants ──
  { q: "what pages are not index", topicsInclude: ["qa"], filter: "not-indexed" },
  { q: "which pages aren't indexed?", topicsInclude: ["qa"], filter: "not-indexed" },
  { q: "show me the unindexed pages", topicsInclude: ["qa"], filter: "not-indexed" },
  { q: "list pages not in google", topicsInclude: ["qa"], filter: "not-indexed" },
  { q: "how many pages are indexed", topicsInclude: ["qa"] },
  { q: "index status", topicsInclude: ["qa"] },
  // ── QA page filters ──
  { q: "which pages have seo issues", topicsInclude: ["qa"], filter: "seo-issues" },
  { q: "pages with arabic alignment issues", topicsInclude: ["qa"], filter: "ar-issues" },
  { q: "show pages with ar issues", topicsInclude: ["qa"], filter: "ar-issues" },
  { q: "pages missing alt text", topicsInclude: ["qa"], filter: "missing-alt" },
  { q: "which images have no alt", topicsInclude: ["qa"], filter: "missing-alt" },
  { q: "any broken pages?", topicsInclude: ["qa"], filter: "non-200" },
  { q: "pages not returning 200", topicsInclude: ["qa"], filter: "non-200" },
  { q: "details for /ar/about", topicsInclude: ["qa"] },
  // ── checklist ──
  { q: "is schema set up?", topicsInclude: ["checklist"] },
  { q: "is the sitemap submitted to gsc?", topicsInclude: ["checklist"] },
  { q: "is google analytics installed", topicsInclude: ["checklist"] },
  { q: "show the whole site checklist", topicsInclude: ["checklist"] },
  { q: "is caching enabled", topicsInclude: ["checklist"] },
  // ── ranking core + drill-downs ──
  { q: "how are my rankings in Saudi Arabia?", topicsInclude: ["ranking"], country: "SA" },
  { q: "ranking position in UAE", topicsInclude: ["ranking"], country: "AE" },
  { q: "which keywords dropped in Qatar?", topicsInclude: ["ranking"], country: "QA" },
  { q: "what improved this week", topicsInclude: ["ranking"] },
  { q: "best ranking keyword", topicsInclude: ["ranking"] },
  { q: "worst performing keywords", topicsInclude: ["ranking"] },
  { q: "how many keywords rank in top 10 in saudi", topicsInclude: ["ranking"], country: "SA", threshold: { kind: "top", n: 10 } },
  { q: "what's in the top 3", topicsInclude: ["ranking"], threshold: { kind: "top", n: 3 } },
  { q: "what is not ranking in kuwait", topicsInclude: ["ranking"], country: "KW", notRanking: true },
  { q: "how is استرجاع أموال التداول doing?", topicsInclude: ["ranking"], keyword: "استرجاع أموال التداول" },
  // ── typos / ASR ──
  { q: "rakings in qatar", topicsInclude: ["ranking"], country: "QA" },
  { q: "how is the pagepseed", topicsInclude: ["pagespeed"] },
  { q: "baklinks summary", topicsInclude: ["backlinks"] },
  { q: "page feed on mobile and desktop", topicsInclude: ["pagespeed"], comparison: true },
  { q: "site speed on mobile", topicsInclude: ["pagespeed"] },
  // ── other metrics ──
  { q: "how many backlinks are indexed?", topicsInclude: ["backlinks"] },
  { q: "what's my seo score?", topicsInclude: ["seo"] },
  { q: "domain rating and organic traffic", topicsInclude: ["health"] },
  { q: "is any data stale or outdated?", topicsInclude: ["freshness"] },
  { q: "what should I focus on?", topicsInclude: ["focus"] },
  { q: "compare mobile vs desktop pagespeed", topicsInclude: ["pagespeed"], comparison: true },
  { q: "summary of rankings and backlinks", topicsInclude: ["ranking", "backlinks"] },
  // ── must NOT mis-fire ──
  { q: "what should I focus on in Qatar?", topicsInclude: ["focus"], country: "QA" },
  { q: "hello there", topicsEmpty: true, greeting: true },
  { q: "thanks!", greeting: true },
  { q: "what is the weather today", topicsEmpty: true },
  { q: "tell me a joke", topicsEmpty: true },
];

describe("NLU eval (live-readiness gate)", () => {
  let pass = 0;
  const failures: string[] = [];
  for (const c of CASES) {
    it(`parses: ${c.q}`, () => {
      const r = p(c.q);
      const errs: string[] = [];
      if (c.topicsInclude) for (const t of c.topicsInclude) if (!r.topics.includes(t)) errs.push(`missing topic ${t} (got ${r.topics.join(",") || "none"})`);
      if (c.topicsEmpty && r.topics.length !== 0) errs.push(`expected no topics, got ${r.topics.join(",")}`);
      if ("country" in c && r.country !== c.country) errs.push(`country ${r.country} != ${c.country}`);
      if ("filter" in c && r.filter !== c.filter) errs.push(`filter ${r.filter} != ${c.filter}`);
      if ("threshold" in c && JSON.stringify(r.threshold) !== JSON.stringify(c.threshold)) errs.push(`threshold ${JSON.stringify(r.threshold)} != ${JSON.stringify(c.threshold)}`);
      if ("notRanking" in c && r.notRanking !== c.notRanking) errs.push(`notRanking ${r.notRanking} != ${c.notRanking}`);
      if ("comparison" in c && r.comparison !== c.comparison) errs.push(`comparison ${r.comparison} != ${c.comparison}`);
      if ("greeting" in c && r.greeting !== c.greeting) errs.push(`greeting ${r.greeting} != ${c.greeting}`);
      if ("keyword" in c && r.keyword !== c.keyword) errs.push(`keyword ${r.keyword} != ${c.keyword}`);
      if (errs.length) { failures.push(`"${c.q}": ${errs.join("; ")}`); }
      else pass++;
      expect(errs, errs.join("; ")).toEqual([]);
    });
  }
  it("meets the >=95% pass gate", () => {
    const rate = pass / CASES.length;
    if (failures.length) console.error("EVAL FAILURES:\n" + failures.join("\n"));
    expect(rate).toBeGreaterThanOrEqual(0.95);
  });
});
```

- [ ] **Step 2: Run, inspect failures** — `npm run test -- nlu.eval`
  Expected first run: some failures printed by the `EVAL FAILURES` log.

- [ ] **Step 3: Iterate** — for each failure, adjust `nlu.ts` (add a synonym to the topic lexicon, a filter phrase, or a threshold alias). Re-run. Repeat until the gate test passes. Do NOT weaken the out-of-domain negatives to cheat the rate.

- [ ] **Step 4: Expand to ≥80 cases** — add rows across these categories until `CASES.length >= 80`: more country×metric combos (each of SA/AE/QA/OM/KW/BH), more typo variants (e.g. `helath`, `bakclinks`, `rankng`), each QA filter phrased 3 ways, both Arabic keywords, more greetings, 6+ out-of-domain negatives. Keep ≥95%.

- [ ] **Step 5: Commit**

```bash
git add src/lib/assistant/nlu.eval.test.ts src/lib/assistant/nlu.ts
git commit -m "test(assistant): NLU eval gate (>=80 cases, >=95% pass)"
```

---

## Task 4: Pure answer formatters (`answers.ts`) + `smart.ts` wiring

**Files:**
- Create: `src/lib/assistant/answers.ts`
- Modify: `src/lib/assistant/smart.ts`

- [ ] **Step 1: Create `answers.ts`** — move the already-pure ranking/focus formatters here, add drill-downs + the new QA/checklist/fallback formatters. No `server-only` import.

```ts
import type { ParsedQuery } from "./nlu";

export type GridRow = { keyword: string; country: string; position: number | null; prev_position: number | null };
export type QaPageRow = {
  url: string | null; indexed_gsc: string | null; status: string | null;
  seo_issues: string | null; ar_alignment_issues: string | null; images_missing_alt: string | null;
  title: string | null; meta_description: string | null; canonical: string | null; h1_count: string | null; lang: string | null;
};
export type SiteAuditRow = Record<string, string | null>;

export const COUNTRY_NAME: Record<string, string> = { SA: "Saudi Arabia", AE: "UAE", QA: "Qatar", OM: "Oman", KW: "Kuwait", BH: "Bahrain" };
export const cname = (code: string) => COUNTRY_NAME[code] ?? code;
export const bullets = (items: string[]) => items.map((i) => `• ${i}`).join("\n");

const CAP = 10;
function capList(head: string, items: string[]): string {
  if (items.length === 0) return `${head}\n• none 🎉`;
  const extra = items.length > CAP ? `\n…and ${items.length - CAP} more` : "";
  return `${head} (${items.length})\n${bullets(items.slice(0, CAP))}${extra}`;
}

const truthy = (v: string | null | undefined) => !!v && v.trim() !== "" && v.trim() !== "—";
const isIndexed = (v: string | null) => /done|yes|indexed|true/i.test(v ?? "");

export function rankingAnswer(q: ParsedQuery, latest: string | null, prev: string | null, all: GridRow[]): string {
  if (!latest || all.length === 0) return "📊 Rankings\nNo ranking data has been imported yet.";
  const rows = q.country ? all.filter((r) => r.country === q.country) : all;
  const scope = q.country ? ` · ${cname(q.country)}` : "";
  const tag = (c: string) => (q.country ? "" : ` (${cname(c)})`);

  if (q.keyword) {
    const cells = all.filter((r) => r.keyword === q.keyword);
    if (cells.length === 0) return `I don't track “${q.keyword}”.`;
    const lines = cells.map((c) => {
      const pos = c.position == null ? "not ranking" : `#${c.position}`;
      let mv = "";
      if (c.position != null && c.prev_position != null) mv = c.position < c.prev_position ? ` (↑ from #${c.prev_position})` : c.position > c.prev_position ? ` (↓ from #${c.prev_position})` : " (no change)";
      else if (c.position != null && c.prev_position == null) mv = " (newly entered)";
      return `${cname(c.country)}: ${pos}${mv}`;
    });
    return `🔎 “${q.keyword}” · week ${latest}\n${bullets(lines)}`;
  }

  if (q.notRanking) {
    const nr = rows.filter((r) => r.position == null);
    return capList(`🚫 Not ranking${scope} · week ${latest}`, nr.map((r) => `“${r.keyword}”${tag(r.country)}`));
  }

  if (q.threshold) {
    const n = q.threshold.n;
    const inTop = rows.filter((r) => r.position != null && (r.position as number) <= n).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return capList(`🎯 In top ${n}${scope} · week ${latest}`, inTop.map((r) => `“${r.keyword}”${tag(r.country)} #${r.position}`));
  }

  if (q.direction) {
    const moved = rows
      .filter((r) => r.position != null && r.prev_position != null && (q.direction === "up" ? (r.position as number) < (r.prev_position as number) : (r.position as number) > (r.prev_position as number)))
      .map((r) => ({ ...r, delta: Math.abs((r.prev_position ?? 0) - (r.position ?? 0)) }))
      .sort((a, b) => b.delta - a.delta);
    const icon = q.direction === "up" ? "⬆" : "⬇";
    const verb = q.direction === "up" ? "improved" : "dropped";
    if (moved.length === 0) return `${icon} No keywords ${verb}${scope} between ${prev ?? "?"} and ${latest}.`;
    return `${icon} ${moved.length} keyword${moved.length === 1 ? "" : "s"} ${verb}${scope} · ${prev ?? "?"} → ${latest}\n${bullets(moved.slice(0, 8).map((r) => `“${r.keyword}”${tag(r.country)} ${r.prev_position}→${r.position}`))}`;
  }

  if (q.extreme === "best") {
    const ranked = rows.filter((r) => r.position != null).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).slice(0, 5);
    if (ranked.length === 0) return `🏆 Best positions${scope}\nNothing is ranking in the top 100 yet.`;
    return `🏆 Best positions${scope} · week ${latest}\n${bullets(ranked.map((r) => `“${r.keyword}”${tag(r.country)} #${r.position}`))}`;
  }
  if (q.extreme === "worst") {
    const notRanking = rows.filter((r) => r.position == null);
    const worst = rows.filter((r) => r.position != null).sort((a, b) => (b.position ?? 0) - (a.position ?? 0)).slice(0, 5);
    const head = `📉 Weakest${scope} · week ${latest}`;
    const nr = notRanking.length ? `${notRanking.length} keyword×country not ranking at all.` : "";
    const list = worst.length ? bullets(worst.map((r) => `“${r.keyword}”${tag(r.country)} #${r.position}`)) : "";
    return [head, nr, list].filter(Boolean).join("\n");
  }

  let top3 = 0, top10 = 0, ranked = 0, improved = 0, dropped = 0, entered = 0, lost = 0;
  let gain: { kw: string; c: string; from: number; to: number; d: number } | null = null;
  let drop: { kw: string; c: string; from: number; to: number; d: number } | null = null;
  for (const r of rows) {
    if (r.position != null) { ranked++; if (r.position <= 10) top10++; if (r.position <= 3) top3++; }
    const pp = r.position, pr = r.prev_position;
    if (pp != null && pr != null) {
      if (pp < pr) { improved++; const d = pr - pp; if (!gain || d > gain.d) gain = { kw: r.keyword, c: r.country, from: pr, to: pp, d }; }
      else if (pp > pr) { dropped++; const d = pp - pr; if (!drop || d > drop.d) drop = { kw: r.keyword, c: r.country, from: pr, to: pp, d }; }
    } else if (pp != null) entered++;
    else if (pr != null) lost++;
  }
  const lines = [
    `In top 100: ${ranked} of ${rows.length}`,
    `In top 10: ${top10}   ·   In top 3: ${top3}`,
    `Improved: ${improved}  ·  Dropped: ${dropped}  ·  New: ${entered}  ·  Fell out: ${lost}`,
  ];
  if (gain) lines.push(`⬆ Biggest gain: “${gain.kw}”${tag(gain.c)} ${gain.from}→${gain.to}`);
  if (drop) lines.push(`⬇ Biggest drop: “${drop.kw}”${tag(drop.c)} ${drop.from}→${drop.to}`);
  return `📊 Rankings${scope} · week ${latest}${prev ? ` (vs ${prev})` : ""}\n${bullets(lines)}`;
}

export function focusAnswer(q: ParsedQuery, latest: string | null, all: GridRow[]): string {
  if (!latest || all.length === 0) return "🎯 No ranking data yet, so I can't suggest keywords to focus on.";
  const rows = q.country ? all.filter((r) => r.country === q.country) : all;
  const scope = q.country ? ` · ${cname(q.country)}` : "";
  const tag = (c: string) => (q.country ? "" : ` (${cname(c)})`);
  const notRanking = rows.filter((r) => r.position == null).map((r) => ({ kw: r.keyword, c: r.country, why: "not ranking" }));
  const outside = rows.filter((r) => r.position != null && (r.position as number) > 10).sort((a, b) => (b.position ?? 0) - (a.position ?? 0)).map((r) => ({ kw: r.keyword, c: r.country, why: `#${r.position}` }));
  const picks = [...notRanking, ...outside].slice(0, 6);
  if (picks.length === 0) return `🎯 Every tracked keyword is already in the top 10${scope}. Focus on holding those positions.`;
  return `🎯 Focus on these weakest keywords${scope}:\n${bullets(picks.map((p) => `“${p.kw}”${tag(p.c)} — ${p.why}`))}\nThey're furthest from page one, so they have the most upside.`;
}

export function qaPagesAnswer(q: ParsedQuery, rows: QaPageRow[]): string {
  if (rows.length === 0) return "🧪 QA\nNo per-page audit data yet — sync the QA Google Sheet.";

  if (q.url) {
    const norm = (u: string | null) => (u ?? "").toLowerCase().replace(/\/$/, "");
    const target = norm(q.url);
    const row = rows.find((r) => norm(r.url).endsWith(target) || norm(r.url).includes(target));
    if (!row) return `🧪 I don't have an audit row for “${q.url}”.`;
    return `🧪 ${row.url}\n${bullets([
      `Indexed: ${row.indexed_gsc ?? "—"}`,
      `Status: ${row.status ?? "—"}`,
      `Title: ${row.title ?? "—"}`,
      `Canonical: ${row.canonical ?? "—"}`,
      `H1s: ${row.h1_count ?? "—"}`,
      `Missing alt: ${row.images_missing_alt ?? "—"}`,
      `SEO issues: ${truthy(row.seo_issues) ? row.seo_issues : "none"}`,
      `AR issues: ${truthy(row.ar_alignment_issues) ? row.ar_alignment_issues : "none"}`,
    ])}`;
  }

  switch (q.filter) {
    case "not-indexed":
      return capList("🚫 Pages not indexed in GSC", rows.filter((r) => !isIndexed(r.indexed_gsc)).map((r) => r.url ?? "(no url)"));
    case "seo-issues":
      return capList("⚠️ Pages with SEO issues", rows.filter((r) => truthy(r.seo_issues)).map((r) => `${r.url ?? "(no url)"} — ${r.seo_issues}`));
    case "ar-issues":
      return capList("🔤 Pages with Arabic alignment issues", rows.filter((r) => truthy(r.ar_alignment_issues)).map((r) => `${r.url ?? "(no url)"} — ${r.ar_alignment_issues}`));
    case "missing-alt":
      return capList("🖼️ Pages with images missing alt text", rows.filter((r) => Number(r.images_missing_alt) > 0).map((r) => `${r.url ?? "(no url)"} — ${r.images_missing_alt} missing`));
    case "non-200":
      return capList("🔧 Pages not returning 200", rows.filter((r) => (r.status ?? "") !== "200").map((r) => `${r.url ?? "(no url)"} — ${r.status ?? "?"}`));
    default: {
      const total = rows.length;
      const indexed = rows.filter((r) => isIndexed(r.indexed_gsc)).length;
      const live = rows.filter((r) => r.status === "200").length;
      const seo = rows.filter((r) => truthy(r.seo_issues)).length;
      const ar = rows.filter((r) => truthy(r.ar_alignment_issues)).length;
      return `🧪 QA Audit · ${total} pages\n${bullets([
        `Indexed in GSC: ${indexed} / ${total}${total - indexed > 0 ? ` (${total - indexed} not indexed)` : ""}`,
        `Live (200): ${live}`,
        ...(seo > 0 ? [`SEO issues: ${seo} pages`] : []),
        ...(ar > 0 ? [`AR alignment issues: ${ar} pages`] : []),
      ])}`;
    }
  }
}

const CHECK_FIELDS: { label: string; key: string; aliases: string[] }[] = [
  { label: "Schema", key: "schema", aliases: ["schema", "structured data"] },
  { label: "Sitemap (GSC)", key: "sitemap_gsc", aliases: ["sitemap"] },
  { label: "Google Analytics", key: "ga", aliases: ["google analytics", "analytics", " ga "] },
  { label: "Search Console", key: "gsc", aliases: ["search console"] },
  { label: "RankMath SEO", key: "rankmath_seo", aliases: ["rankmath"] },
  { label: "Caching", key: "caching_plugins", aliases: ["caching", "cache"] },
  { label: "Imagify", key: "imagify", aliases: ["imagify"] },
  { label: "HTML lang", key: "html_lang", aliases: ["html lang"] },
  { label: "Search engine visibility", key: "search_engine_visibility", aliases: ["search engine visibility", "visibility"] },
  { label: "Index status", key: "index_status", aliases: ["index status"] },
  { label: "Site icon", key: "site_icon", aliases: ["site icon", "favicon"] },
];

export function siteChecklistAnswer(normalizedText: string, row: SiteAuditRow | null): string {
  if (!row) return "🗂️ Site checklist\nNo whole-site QA data synced yet.";
  const generic = normalizedText.includes("checklist") || normalizedText.includes("whole site") || normalizedText.includes("whole website");
  if (!generic) {
    const hit = CHECK_FIELDS.find((f) => f.aliases.some((a) => normalizedText.includes(a)));
    if (hit) return `🗂️ ${hit.label}\n• ${truthy(row[hit.key]) ? row[hit.key] : "not set / unknown"}`;
  }
  return `🗂️ Whole-site checklist\n${bullets(CHECK_FIELDS.map((f) => `${f.label}: ${truthy(row[f.key]) ? row[f.key] : "—"}`))}`;
}

const CAPABILITIES =
  "I can answer questions about this dashboard's data:\n• Rankings — by country, what improved/dropped, best/worst, top-N, not ranking\n• Which pages aren't indexed / have SEO or Arabic issues / missing alt / broken\n• Whole-site checklist (schema, sitemap, analytics, caching…)\n• What to focus on • Backlinks • PageSpeed (mobile vs desktop) • SEO score • Site health • Data freshness\nAsk in plain English.";

export function fallbackMessage(q: ParsedQuery): string {
  if (q.greeting) return `👋 Hi! ${CAPABILITIES}`;
  return `🤔 I'm not sure which metric you mean.\n\n${CAPABILITIES}`;
}

export { CAPABILITIES };
```

- [ ] **Step 2: Rewrite `smart.ts`** to import from `answers.ts`, add QA per-page / checklist fetches, and route. Replace the file with:

```ts
import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseQuery, type ParsedQuery, type Topic } from "./nlu";
import { normalize } from "./text";
import {
  rankingAnswer, focusAnswer, qaPagesAnswer, siteChecklistAnswer, fallbackMessage,
  bullets, cname, type GridRow, type QaPageRow, type SiteAuditRow,
} from "./answers";

type SB = Awaited<ReturnType<typeof createServerSupabaseClient>>;

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function resolveSite(sb: SB, siteId?: string | null): Promise<{ id: string; name: string } | null> {
  if (siteId) {
    const { data } = await sb.from("sites").select("id, display_name").eq("id", siteId).single();
    return data ? { id: data.id, name: data.display_name } : null;
  }
  const { data } = await sb.from("sites").select("id, display_name").order("sort_order").limit(1);
  const r = (data ?? [])[0] as { id: string; display_name: string } | undefined;
  return r ? { id: r.id, name: r.display_name } : null;
}

async function loadGrid(sb: SB, siteId: string): Promise<{ latest: string | null; prev: string | null; rows: GridRow[] }> {
  const { data: weeks } = await sb.rpc("ranking_weeks");
  const wk = ((weeks ?? []) as { week_date: string }[]).map((w) => w.week_date);
  if (wk.length === 0) return { latest: null, prev: null, rows: [] };
  const { data } = await sb.rpc("ranking_grid", { p_site_id: siteId, p_week: wk[0] });
  return { latest: wk[0], prev: wk[1] ?? null, rows: (data ?? []) as GridRow[] };
}

async function backlinksAnswer(sb: SB, siteId: string): Promise<string> {
  const { data } = await sb.from("backlinks").select("date, indexed, status, source_site").eq("site_id", siteId).limit(5000);
  const rows = (data ?? []) as Array<{ date: string; indexed: string | null; status: string | null; source_site: string | null }>;
  if (rows.length === 0) return "🔗 Backlinks\nNone recorded yet — sync from the Google Sheet on the Backlinks page.";
  const total = rows.length;
  const indexed = rows.filter((r) => r.indexed && !/^(no|not)/i.test(r.indexed.trim())).length;
  const domains = new Set(rows.map((r) => r.source_site).filter(Boolean)).size;
  const month = todayLocal().slice(0, 7);
  const built = rows.filter((r) => (r.date ?? "").slice(0, 7) === month).length;
  const byStatus = new Map<string, number>();
  for (const r of rows) if (r.status) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
  const lines = [`Total: ${total} from ${domains} domains`, `Indexed: ${indexed} (${Math.round((indexed / total) * 100)}%)`, `Built this month: ${built}`];
  const statusStr = [...byStatus.entries()].map(([s, n]) => `${s} ${n}`).join("  ·  ");
  if (statusStr) lines.push(`By status: ${statusStr}`);
  return `🔗 Backlinks\n${bullets(lines)}`;
}

async function pagespeedAnswer(sb: SB, siteId: string, q: ParsedQuery): Promise<string> {
  const { data } = await sb
    .from("pagespeed_entries")
    .select("date, mobile_score, mobile_accessibility, mobile_best_practices, mobile_seo, desktop_score, desktop_accessibility, desktop_best_practices, desktop_seo, pagespeed_urls!inner(site_id)")
    .eq("pagespeed_urls.site_id", siteId)
    .order("date", { ascending: false })
    .limit(2);
  const rows = (data ?? []) as unknown as Array<Record<string, number | string | null>>;
  if (rows.length === 0) return "⚡ PageSpeed\nNo data has been captured yet.";
  const r = rows[0];
  const n = (v: number | string | null) => (v ?? "—");
  if (q.comparison) {
    return `⚡ PageSpeed · ${r.date} — Mobile vs Desktop\n${bullets([
      `Performance: ${n(r.mobile_score)} vs ${n(r.desktop_score)}`,
      `Accessibility: ${n(r.mobile_accessibility)} vs ${n(r.desktop_accessibility)}`,
      `Best Practices: ${n(r.mobile_best_practices)} vs ${n(r.desktop_best_practices)}`,
      `SEO: ${n(r.mobile_seo)} vs ${n(r.desktop_seo)}`,
    ])}\n(scores out of 100)`;
  }
  let trend = "";
  if (rows[1] && q.direction) {
    const cur = [r.mobile_score, r.desktop_score].filter((v): v is number => typeof v === "number");
    const prevRow = rows[1];
    const prevVals = [prevRow.mobile_score, prevRow.desktop_score].filter((v): v is number => typeof v === "number");
    if (cur.length && prevVals.length) {
      const ca = Math.round(cur.reduce((a, b) => a + b, 0) / cur.length);
      const pa = Math.round(prevVals.reduce((a, b) => a + b, 0) / prevVals.length);
      const diff = ca - pa;
      trend = `\n${diff === 0 ? "▪ Flat" : diff > 0 ? `⬆ Up ${diff}` : `⬇ Down ${Math.abs(diff)}`} vs ${prevRow.date}.`;
    }
  }
  return `⚡ PageSpeed · ${r.date}\n${bullets([
    `Mobile — Perf ${n(r.mobile_score)} · A11y ${n(r.mobile_accessibility)} · BP ${n(r.mobile_best_practices)} · SEO ${n(r.mobile_seo)}`,
    `Desktop — Perf ${n(r.desktop_score)} · A11y ${n(r.desktop_accessibility)} · BP ${n(r.desktop_best_practices)} · SEO ${n(r.desktop_seo)}`,
  ])}\n(scores out of 100)${trend}`;
}

async function seoAnswer(sb: SB, siteId: string): Promise<string> {
  const { data } = await sb.from("seo_scores").select("date, seo_score, passed_tests, warnings, failed_tests").eq("site_id", siteId).order("date", { ascending: false }).limit(1);
  const r = (data ?? [])[0] as { date: string; seo_score: number | null; passed_tests: number | null; warnings: number | null; failed_tests: number | null } | undefined;
  if (!r) return "✅ SEO score\nNone recorded yet — an admin can add one on the SEO page.";
  return `✅ SEO score · ${r.date}\n${bullets([`Score: ${r.seo_score ?? "—"}/100`, `${r.passed_tests ?? 0} passed · ${r.warnings ?? 0} warnings · ${r.failed_tests ?? 0} failed`])}`;
}

async function healthAnswer(sb: SB, siteId: string): Promise<string> {
  const { data } = await sb.from("health_snapshots").select("date, domain_rating, referring_domains, organic_traffic, organic_keywords").eq("site_id", siteId).order("date", { ascending: false }).limit(1);
  const r = (data ?? [])[0] as { date: string; domain_rating: number | null; referring_domains: number | null; organic_traffic: number | null; organic_keywords: number | null } | undefined;
  if (!r) return "📈 Site health\nNo snapshot recorded yet.";
  return `📈 Site health · ${r.date}\n${bullets([
    `Domain Rating: ${r.domain_rating ?? "—"}`,
    `Referring domains: ${r.referring_domains ?? "—"}`,
    `Organic traffic: ${r.organic_traffic ?? "—"}`,
    `Organic keywords: ${r.organic_keywords ?? "—"}`,
  ])}`;
}

async function loadQaPages(sb: SB, siteId: string): Promise<QaPageRow[]> {
  const { data } = await sb
    .from("qa_page_audit")
    .select("url, indexed_gsc, status, seo_issues, ar_alignment_issues, images_missing_alt, title, meta_description, canonical, h1_count, lang")
    .eq("site_id", siteId);
  return (data ?? []) as QaPageRow[];
}

async function loadSiteAudit(sb: SB, siteId: string): Promise<SiteAuditRow | null> {
  const { data } = await sb.from("qa_site_audit").select("*").eq("site_id", siteId).maybeSingle();
  return (data ?? null) as SiteAuditRow | null;
}

async function maxDate(sb: SB, table: string, col: string): Promise<string | null> {
  const { data } = await sb.from(table).select(col).order(col, { ascending: false }).limit(1);
  const row = (data ?? [])[0] as unknown as Record<string, string> | undefined;
  return row ? (row[col] ?? null) : null;
}

async function freshnessAnswer(sb: SB): Promise<string> {
  const today = todayLocal();
  const sections: { name: string; latest: string | null }[] = [
    { name: "SEO", latest: await maxDate(sb, "seo_scores", "date") },
    { name: "Health", latest: await maxDate(sb, "health_snapshots", "date") },
    { name: "PageSpeed", latest: await maxDate(sb, "pagespeed_entries", "date") },
    { name: "Ranking", latest: await maxDate(sb, "rankings", "week_date") },
    { name: "Backlinks", latest: await maxDate(sb, "backlinks", "date") },
  ];
  const days = (d: string) => Math.floor((Date.parse(today) - Date.parse(d)) / 86400000);
  const stale = sections.filter((s) => !s.latest || days(s.latest) > 14).map((s) => `${s.name} — ${s.latest ? `${days(s.latest)} days old` : "no data"}`);
  if (stale.length === 0) return "🕒 Data freshness\nAll sections updated within the last 14 days — nothing stale.";
  return `🕒 Stale or missing (14+ days)\n${bullets(stale)}`;
}

/** Tokenless smart answer: parse the question, then compute the answer from live data. */
export async function smartAnswer(question: string, siteId?: string | null): Promise<string> {
  const sb = await createServerSupabaseClient();
  const site = await resolveSite(sb, siteId);
  if (!site) return "No sites are configured in the dashboard yet.";

  const [{ data: ctys }, { data: kws }] = await Promise.all([
    sb.from("countries").select("code"),
    sb.from("keywords").select("text"),
  ]);
  const vocab = {
    countryCodes: ((ctys ?? []) as { code: string }[]).map((c) => c.code),
    keywords: ((kws ?? []) as { text: string }[]).map((k) => k.text),
  };

  const q = parseQuery(question, vocab);
  if (q.topics.length === 0) return fallbackMessage(q);

  let topics = q.topics;
  if (topics.includes("focus") && topics.includes("ranking") && !q.country && !q.direction && !q.extreme && !q.keyword && !q.threshold && !q.notRanking) {
    topics = topics.filter((t) => t !== "ranking");
  }
  // A QA page-level question (filter/url) shouldn't also fire the broad ranking catch-all on "page".
  const qaPageLevel = topics.includes("qa") && (q.filter !== null || q.url !== null);
  if (qaPageLevel) topics = topics.filter((t) => t !== "ranking");

  const needsGrid = topics.includes("ranking") || topics.includes("focus");
  const grid = needsGrid ? await loadGrid(sb, site.id) : null;
  const normalized = normalize(question);

  const parts: string[] = [];
  for (const topic of topics as Topic[]) {
    switch (topic) {
      case "ranking": parts.push(rankingAnswer(q, grid!.latest, grid!.prev, grid!.rows)); break;
      case "focus": parts.push(focusAnswer(q, grid!.latest, grid!.rows)); break;
      case "backlinks": parts.push(await backlinksAnswer(sb, site.id)); break;
      case "pagespeed": parts.push(await pagespeedAnswer(sb, site.id, q)); break;
      case "seo": parts.push(await seoAnswer(sb, site.id)); break;
      case "health": parts.push(await healthAnswer(sb, site.id)); break;
      case "qa": parts.push(qaPagesAnswer(q, await loadQaPages(sb, site.id))); break;
      case "checklist": parts.push(siteChecklistAnswer(normalized, await loadSiteAudit(sb, site.id))); break;
      case "freshness": parts.push(await freshnessAnswer(sb)); break;
    }
  }
  return parts.join("\n\n");
}
```

  Note: `cname` is imported for parity with the old file but may be unused in `smart.ts` now — if `tsc`/eslint flags it as unused, remove it from the import. Keep the import list to only what's referenced.

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit`
  Expected: no errors. Fix any unused-import or type mismatch inline.

- [ ] **Step 4: Run existing tests** — `npm run test`
  Expected: `nlu.test`, `match.test`, `text.test`, `nlu.eval` all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/assistant/answers.ts src/lib/assistant/smart.ts
git commit -m "feat(assistant): per-page QA lister, whole-site checklist, ranking drill-downs"
```

---

## Task 5: Answer-shape eval (`smart.eval.test.ts`)

**Files:**
- Create: `src/lib/assistant/smart.eval.test.ts`

Tests the pure formatters directly (no DB), confirming the answer text is correct and the cap applies.

- [ ] **Step 1: Write the test** — `src/lib/assistant/smart.eval.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { parseQuery } from "./nlu";
import { qaPagesAnswer, siteChecklistAnswer, rankingAnswer, type QaPageRow, type GridRow } from "./answers";
import { normalize } from "./text";

const VOCAB = { countryCodes: ["SA", "QA", "OM", "KW", "BH", "AE"], keywords: [] as string[] };

function mkPage(over: Partial<QaPageRow>): QaPageRow {
  return { url: "/p", indexed_gsc: "Yes", status: "200", seo_issues: "—", ar_alignment_issues: "—", images_missing_alt: "0", title: "t", meta_description: "m", canonical: "/p", h1_count: "1", lang: "ar", ...over };
}

describe("answer shapes", () => {
  it("lists pages that are not indexed (the screenshot fix)", () => {
    const rows: QaPageRow[] = [
      mkPage({ url: "/ar/a", indexed_gsc: "No" }),
      mkPage({ url: "/ar/b", indexed_gsc: "Yes" }),
      mkPage({ url: "/ar/c", indexed_gsc: "Not indexed" }),
    ];
    const q = parseQuery("what pages are not index", VOCAB);
    const out = qaPagesAnswer(q, rows);
    expect(out).toContain("🚫 Pages not indexed");
    expect(out).toContain("/ar/a");
    expect(out).toContain("/ar/c");
    expect(out).not.toContain("/ar/b");
    expect(out).toContain("(2)");
  });

  it("caps long lists at 10 with +N more", () => {
    const rows: QaPageRow[] = Array.from({ length: 14 }, (_, i) => mkPage({ url: `/p${i}`, indexed_gsc: "No" }));
    const q = parseQuery("which pages aren't indexed", VOCAB);
    const out = qaPagesAnswer(q, rows);
    expect(out).toContain("…and 4 more");
    expect(out).toContain("(14)");
  });

  it("summarizes the whole-site checklist and answers a specific field", () => {
    const row = { schema: "Yes", sitemap_gsc: "Submitted", ga: "Installed", gsc: "Verified", rankmath_seo: "90", caching_plugins: "WP Rocket", imagify: "On", html_lang: "ar", search_engine_visibility: "Public", index_status: "Indexed", site_icon: "Set" };
    expect(siteChecklistAnswer(normalize("is schema set up?"), row)).toContain("Schema");
    expect(siteChecklistAnswer(normalize("is schema set up?"), row)).toContain("Yes");
    expect(siteChecklistAnswer(normalize("show the whole site checklist"), row)).toContain("Whole-site checklist");
  });

  it("lists keywords in the top N for a country", () => {
    const grid: GridRow[] = [
      { keyword: "k1", country: "SA", position: 2, prev_position: 3 },
      { keyword: "k2", country: "SA", position: 25, prev_position: 30 },
      { keyword: "k3", country: "SA", position: 8, prev_position: 8 },
    ];
    const q = parseQuery("how many keywords rank in top 10 in saudi", VOCAB);
    const out = rankingAnswer(q, "2026-06-08", "2026-06-01", grid);
    expect(out).toContain("In top 10 · Saudi Arabia");
    expect(out).toContain("k1");
    expect(out).toContain("k3");
    expect(out).not.toContain("k2");
  });
});
```

- [ ] **Step 2: Run** — `npm run test -- smart.eval` → PASS. Fix `answers.ts` if any shape assertion fails.

- [ ] **Step 3: Commit**

```bash
git add src/lib/assistant/smart.eval.test.ts
git commit -m "test(assistant): answer-shape eval for QA lister, checklist, drill-downs"
```

---

## Task 6: Full verification gate

**Files:** none (verification only).

- [ ] **Step 1: Full test suite** — `npm run test`
  Expected: ALL suites pass; `nlu.eval` gate ≥95%; ≥80 eval cases.

- [ ] **Step 2: Typecheck + build** — `npx tsc --noEmit` then `npm run build`
  Expected: both clean (no type errors, build succeeds).

- [ ] **Step 3: Browser smoke test** — use the **webapp-testing** skill. `npm run dev`, log in (`admin123`/`admin123`), open the SEO Assistant widget, and ask:
  1. "what pages are not index" → expect a 🚫 list of URLs (NOT "I'm not sure").
  2. "which pages have arabic issues" → 🔤 list.
  3. "is schema set up?" → 🗂️ checklist field.
  4. "how many keywords rank in top 10 in saudi" → 🎯 top-10 list.
  5. "pagepseed on mobile vs desktop" (typo) → ⚡ comparison.
  6. "tell me a joke" → graceful capabilities fallback.
  Capture a screenshot of #1 as proof.

- [ ] **Step 4: Commit any fixes** found during smoke test, then proceed only if all six behave.

---

## Task 7: Deploy to live

**Files:** none (git push).

- [ ] **Step 1: Confirm clean tree + branch** — `git status` (clean), `git branch --show-current` (`master`).

- [ ] **Step 2: Push** — `git push origin master`
  Expected: push succeeds via Git Credential Manager to `Optinet-Solutions-AI/GRG-Dashboard`.

- [ ] **Step 3: Verify Vercel deploy** — wait for the auto-deploy, then fetch `https://grg-dashboard.vercel.app` and confirm 200 + the dashboard renders. If Vercel CLI/API is available, confirm the latest deployment is "Ready"; otherwise verify via HTTP.

- [ ] **Step 4: Live smoke** — on `grg-dashboard.vercel.app`, open the widget and ask "what pages are not index" → confirm the real list renders in production.

- [ ] **Step 5: Report** — summarize eval pass rate, the new capabilities, and the live URL to the user.

---

## Self-Review

**Spec coverage:**
- Exact-substring brittleness → Task 1 (stem/fuzzy) + Task 2 (hybrid matcher). ✓
- Aggregate-only answers / list URLs → Task 4 `qaPagesAnswer` + Task 5 shape tests. ✓
- Dead-end fallback → `fallbackMessage` (Task 4); confident routing via slots. ✓ (Note: design's "did you mean…" is implemented as the capabilities menu; best-guess is covered by fuzzy pulling near-misses into `topics`.)
- Unused `qa_site_audit` → Task 4 `siteChecklistAnswer`. ✓
- Ranking drill-downs (top-N, not-ranking, keyword+country) → Task 4 `rankingAnswer`. ✓
- Eval ≥95%, 80–120 cases → Task 3. ✓
- Deploy gate → Tasks 6–7. ✓
- Tokenless / no LLM → no model anywhere; all compute from DB. ✓

**Type consistency:** `ParsedQuery` slots (`filter`, `threshold`, `list`, `url`, `notRanking`) defined in Task 2 are consumed with identical names/shapes in Task 4. `GridRow`/`QaPageRow`/`SiteAuditRow` defined in `answers.ts` and imported by `smart.ts`. `qaPagesAnswer(q, rows)` / `siteChecklistAnswer(normalizedText, row)` / `rankingAnswer(q, latest, prev, rows)` signatures match call sites. ✓

**Placeholder scan:** No TBD/TODO. Task 3 Step 4 ("expand to ≥80") is a concrete, enumerated expansion of a fully-working pattern, not a placeholder. ✓

**Ambiguity:** "≥95% pass" and "≥80 cases" are explicit gates. Per-page cap fixed at 10. ✓

import { describe, it, expect } from "vitest";
import { parseQuery, type ParsedQuery } from "./nlu";

// The "training" loop for a deterministic engine: a labelled question set that
// must hit >=95% to be considered live-ready. Covers clean phrasings, typos,
// ASR errors, Arabic keywords, every metric, every QA filter, multi-topic,
// greetings, and out-of-domain negatives (which must NOT false-positive).

const VOCAB = {
  countryCodes: ["SA", "QA", "OM", "KW", "BH", "AE"],
  keywords: ["استرجاع أموال التداول", "احتيال منصات التداول"],
};
const p = (s: string) => parseQuery(s, VOCAB);

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
  { q: "list pages that aren't indexed", topicsInclude: ["qa"], filter: "not-indexed" },
  { q: "how many pages are indexed", topicsInclude: ["qa"], filter: null },
  { q: "what's the index status", topicsInclude: ["qa"], filter: null },

  // ── QA page filters ──
  { q: "which pages have seo issues", topicsInclude: ["qa"], filter: "seo-issues" },
  { q: "show me pages with seo problems", topicsInclude: ["qa"], filter: "seo-issues" },
  { q: "pages with arabic alignment issues", topicsInclude: ["qa"], filter: "ar-issues" },
  { q: "show pages with ar issues", topicsInclude: ["qa"], filter: "ar-issues" },
  { q: "which pages have rtl problems", topicsInclude: ["qa"], filter: "ar-issues" },
  { q: "pages missing alt text", topicsInclude: ["qa"], filter: "missing-alt" },
  { q: "which images have no alt", topicsInclude: ["qa"], filter: "missing-alt" },
  { q: "pages without alt tags", topicsInclude: ["qa"], filter: "missing-alt" },
  { q: "any broken pages?", topicsInclude: ["qa"], filter: "non-200" },
  { q: "pages not returning 200", topicsInclude: ["qa"], filter: "non-200" },
  { q: "which pages are not live", topicsInclude: ["qa"], filter: "non-200" },
  { q: "details for /ar/about", topicsInclude: ["qa"] },

  // ── checklist ──
  { q: "is schema set up?", topicsInclude: ["checklist"] },
  { q: "do we have structured data", topicsInclude: ["checklist"] },
  { q: "is the sitemap submitted to gsc?", topicsInclude: ["checklist"] },
  { q: "is google analytics installed", topicsInclude: ["checklist"] },
  { q: "is caching enabled", topicsInclude: ["checklist"] },
  { q: "show the whole site checklist", topicsInclude: ["checklist"] },
  { q: "is the favicon set", topicsInclude: ["checklist"] },
  { q: "search engine visibility status", topicsInclude: ["checklist"] },

  // ── ranking core + drill-downs ──
  { q: "how are my rankings in Saudi Arabia?", topicsInclude: ["ranking"], country: "SA" },
  { q: "ranking position in UAE", topicsInclude: ["ranking"], country: "AE" },
  { q: "which keywords dropped in Qatar?", topicsInclude: ["ranking"], country: "QA" },
  { q: "what improved this week", topicsInclude: ["ranking"] },
  { q: "best ranking keyword", topicsInclude: ["ranking"] },
  { q: "worst performing keywords", topicsInclude: ["ranking"] },
  { q: "how many keywords rank in top 10 in saudi", topicsInclude: ["ranking"], country: "SA", threshold: { kind: "top", n: 10 } },
  { q: "what's in the top 3", topicsInclude: ["ranking"], threshold: { kind: "top", n: 3 } },
  { q: "show me keywords in the top 10 for bahrain", topicsInclude: ["ranking"], country: "BH", threshold: { kind: "top", n: 10 } },
  { q: "what is not ranking in kuwait", topicsInclude: ["ranking"], country: "KW", notRanking: true },
  { q: "what dropped in oman", topicsInclude: ["ranking"], country: "OM" },
  { q: "biggest gains this week", topicsInclude: ["ranking"] },
  { q: "keyword positions in kuwait", topicsInclude: ["ranking"], country: "KW" },
  { q: "how is استرجاع أموال التداول doing?", topicsInclude: ["ranking"], keyword: "استرجاع أموال التداول" },
  { q: "position of احتيال منصات التداول in oman", topicsInclude: ["ranking"], country: "OM", keyword: "احتيال منصات التداول" },

  // ── typos / ASR ──
  { q: "rankng in qatar", topicsInclude: ["ranking"], country: "QA" },
  { q: "how is the pagepseed", topicsInclude: ["pagespeed"] },
  { q: "baklinks summary", topicsInclude: ["backlinks"] },
  { q: "what's my helth score", topicsInclude: ["health"] },
  { q: "show me the keywrd positions", topicsInclude: ["ranking"] },
  { q: "organic trafic", topicsInclude: ["health"] },
  { q: "page feed on mobile and desktop", topicsInclude: ["pagespeed"], comparison: true },
  { q: "site speed on mobile", topicsInclude: ["pagespeed"] },

  // ── pagespeed / other metrics ──
  { q: "compare mobile vs desktop pagespeed", topicsInclude: ["pagespeed"], comparison: true },
  { q: "pagespeed score", topicsInclude: ["pagespeed"] },
  { q: "core web vitals", topicsInclude: ["pagespeed"] },
  { q: "lighthouse performance score", topicsInclude: ["pagespeed"] },
  { q: "how fast does the site load", topicsInclude: ["pagespeed"] },
  { q: "how many backlinks do we have", topicsInclude: ["backlinks"] },
  { q: "referring domains count", topicsInclude: ["backlinks"] },
  { q: "link building progress", topicsInclude: ["backlinks"] },
  { q: "what's my seo score?", topicsInclude: ["seo"] },
  { q: "rankmath analysis", topicsInclude: ["seo"] },
  { q: "show domain rating and organic traffic", topicsInclude: ["health"] },
  { q: "what's the domain authority", topicsInclude: ["health"] },
  { q: "is any data stale or outdated?", topicsInclude: ["freshness"] },
  { q: "when was the data last updated", topicsInclude: ["freshness"] },
  { q: "what should I focus on?", topicsInclude: ["focus"] },
  { q: "which keywords should I prioritise?", topicsInclude: ["focus"] },
  { q: "where should I improve", topicsInclude: ["focus"] },

  // ── country × metric combos ──
  { q: "rankings in dubai", topicsInclude: ["ranking"], country: "AE" },
  { q: "how are we doing in ksa", topicsInclude: ["ranking"], country: "SA" },
  { q: "keyword rankings in doha", topicsInclude: ["ranking"], country: "QA" },
  { q: "positions in muscat", topicsInclude: ["ranking"], country: "OM" },
  { q: "rankings in manama", topicsInclude: ["ranking"], country: "BH" },
  { q: "what's ranking in the emirates", topicsInclude: ["ranking"], country: "AE" },

  // ── multi-topic ──
  { q: "summary of rankings and backlinks", topicsInclude: ["ranking", "backlinks"] },
  { q: "give me seo score and site health", topicsInclude: ["seo", "health"] },

  // ── must NOT mis-fire (negatives + greetings) ──
  { q: "what should I focus on in Qatar?", topicsInclude: ["focus"], country: "QA" },
  { q: "hello there", topicsEmpty: true, greeting: true },
  { q: "hi", topicsEmpty: true, greeting: true },
  { q: "thanks!", greeting: true },
  { q: "good morning", topicsEmpty: true, greeting: true },
  { q: "what can you do", greeting: true },
  { q: "who are you", greeting: true },
  { q: "what is the weather today", topicsEmpty: true },
  { q: "tell me a joke", topicsEmpty: true },
  { q: "order a pizza", topicsEmpty: true },
  { q: "sing me a song", topicsEmpty: true },
];

describe("NLU eval (live-readiness gate)", () => {
  it(`meets the >=95% pass gate over ${CASES.length} cases`, () => {
    const failures: string[] = [];
    for (const c of CASES) {
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
      if (errs.length) failures.push(`"${c.q}": ${errs.join("; ")}`);
    }
    const rate = (CASES.length - failures.length) / CASES.length;
    if (failures.length) {
      // eslint-disable-next-line no-console
      console.error(`EVAL ${Math.round(rate * 100)}% (${failures.length} failing):\n` + failures.join("\n"));
    }
    expect(rate, `pass rate ${Math.round(rate * 100)}% < 95%`).toBeGreaterThanOrEqual(0.95);
  });
});

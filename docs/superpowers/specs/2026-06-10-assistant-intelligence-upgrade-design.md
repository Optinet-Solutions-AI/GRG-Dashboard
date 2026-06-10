# Assistant Intelligence Upgrade — Design

**Date:** 2026-06-10
**Status:** Approved (scope), pending spec review
**Component:** `src/lib/assistant/*` (tokenless NLU assistant)
**Client context:** Gulf Recovery Group dashboard — Arabic-first, 6 GCC markets, 15 keywords.

## Problem

The chat assistant ("SEO Assistant" widget) only answers obvious, exactly-phrased
questions. Observed failure: *"what pages are not index"* → "I'm not sure which
metric you mean." Root causes:

1. **Exact substring matching** in `nlu.ts`. `"index"` ≠ `"indexed"`; no stemming,
   no typo tolerance beyond a few hand-coded cases. One missing `-ed` drops the topic.
2. **Aggregate-only answers** in `smart.ts`. QA answer reports *counts* ("5 pages have
   SEO issues") but cannot list **which** pages — even though `qa_page_audit.url` exists.
3. **Dead-end fallback.** No "did you mean…", no closest-guess. Just a static menu.
4. **`qa_site_audit` (25-column whole-site checklist) is entirely unused.**

## Non-negotiable constraints

- **Tokenless. No API key, no LLM.** (User-locked decision — zero cost, cannot
  hallucinate because every answer is computed from the DB.) Add capability by
  extending the NLU + `smart.ts` handlers, never by adding a model.
- **Scannable answers** — emoji header + bullet lines (existing format kept).
- **Forgiving of typos / ASR errors** (voice input feeds the same parser).
- **Arabic keywords** must still be detectable (they live in `keywords.text`).
- Read-only over already-public data; usable by anonymous viewers.

## Architecture (unchanged shape, upgraded layers)

```
AssistantWidget.tsx ──(free text q)──▶ askAssistant() server action
                                            │
                                            ▼
                              smartAnswer(q, siteId)  [smart.ts]
                                            │
                         parseQuery(text, vocab)  [nlu.ts]   ← UPGRADED
                                            │ ParsedQuery (topics + slots)
                                            ▼
                     topic handlers compute from Supabase     ← EXPANDED
                                            │
                                            ▼
                                  scannable text answer
```

The `parse → compute` split stays. We upgrade the parser's robustness and the slot
richness, and we add handlers. `rule-provider.ts` (preset-chip path) is untouched.

## Component 1 — Robustness layer (`nlu.ts`)

New internal helpers, kept as pure functions (testable, no network):

- **`tokenize(text)`** → normalized word array. Lowercase, strip punctuation,
  collapse whitespace. Arabic preserved.
- **`stem(token)`** → light suffix stripper for English only (leave non-ASCII / Arabic
  untouched): drop `-ing`, `-ed`, `-s`, `-es`, `-ation`. So `index/indexed/indexing`,
  `rank/ranking/ranked`, `drop/dropped` all collapse to a shared stem. Conservative —
  only strips when the remainder is ≥3 chars.
- **`fuzzyHit(token, lexicon)`** → true if `token` exactly matches, or is within
  Levenshtein distance ≤1 (tokens ≤5 chars) / ≤2 (longer) of, any lexicon trigger.
  Catches `indx`, `pagepseed`, `rakings`, `baklinks`. **Country codes and the Arabic
  keyword vocab are matched EXACTLY (no fuzz)** — never fuzzy-match an entity that
  drives a number, to avoid confident-wrong answers.
- Topic detection runs over **stemmed tokens with fuzzy fallback**, replacing raw
  `t.includes(word)`. Existing topic keyword lists are kept and become the lexicon.

**Slot model.** `ParsedQuery` gains optional slots (additive — existing fields kept):
- `subject: "page" | "keyword" | "country" | "metric" | null` — what the user is asking about.
- `filter: "not-indexed" | "seo-issues" | "ar-issues" | "missing-alt" | "non-200" | null` — QA page filters.
- `threshold: { kind: "top"; n: number } | null` — e.g. "top 10", "top 3".
- `list: boolean` — "which/list/show me the pages" → list mode; "how many" → count mode.
- `url: string | null` — a URL/path mentioned, for per-page detail.

## Component 2 — Confident fallback (`nlu.ts` + `smart.ts`)

When `topics.length === 0`:
1. If a partial signal exists (a recognized country, keyword, action word, or a fuzzy
   near-miss on a topic), pick the **best-guess topic** and answer it, prefixed with a
   soft "Showing X — ask differently if you meant something else."
2. Else return **"Did you mean…"** with 2–3 concrete example questions built from words
   actually present in the query (not the static menu). Never a bare shrug.

## Component 3 — New answerable intents (`smart.ts`), all from existing data

**A. Per-page QA — `qa_page_audit` (the screenshot fix).** New handler
`qaPagesAnswer(filter, list)`. Lists actual URLs, **capped at 10 with "+N more"**, plus
total count. Filters:
- `not-indexed` — `indexed_gsc` not in {done,yes,indexed,true}. → *"what pages aren't indexed"*
- `seo-issues` — `seo_issues` non-empty / not "—". → URL + issue text.
- `ar-issues` — `ar_alignment_issues` non-empty. → *"Arabic alignment issues"*
- `missing-alt` — `images_missing_alt` > 0. → URL + count.
- `non-200` — `status` ≠ "200". → URL + status.
- `url` present — single-page detail card: title, meta, canonical, h1_count, indexed, status, issues.

**B. Whole-site checklist — `qa_site_audit` (new handler `siteChecklistAnswer`).**
Summarizes key fields (rankmath_seo, schema, sitemap_gsc, gsc, ga, caching_plugins,
html_lang, index_status, search_engine_visibility). Specific lookups: "is schema set
up?", "is the sitemap submitted?", "is GA installed?" → the matching field's value.

**C. Ranking drill-downs (extend `rankingAnswer`).**
- `threshold.top=N` + country → count + list of keywords within top N for that country.
- "what's not ranking in `<country>`" → list null-position keywords for that country.
- keyword + country together → the single cell (position + movement).

## Component 4 — The "training" loop (eval harness)

This is how "train it until it's good" becomes measurable for a deterministic engine.

- **`nlu.eval.test.ts`** — 80–120 labelled cases. Each: `{ q, expect: { topics?, country?, filter?, threshold?, list? } }`. Covers: clean phrasings, typos, ASR-style errors ("page feed", "not index", "rakings"), Arabic keywords, every metric, every QA filter, multi-topic, greetings, and out-of-domain (must NOT false-positive). **Gate: ≥95% pass.**
- **`smart.eval.test.ts`** — a subset (~15) asserting answer *shape* against a mocked
  Supabase client (header emoji present, URLs listed, count correct, cap applied).
- Existing `nlu.test.ts` / `match.test.ts` stay green (no regressions).

Iterate: run → inspect failures → fix lexicon/stemmer/handler → re-run, until the gate
is met. Failures drive the fix; that loop is the "training."

## Component 5 — Deploy gate (only after green)

1. `npm run test` — all suites pass, eval ≥95%.
2. `npx tsc --noEmit` + `npm run build` — clean.
3. Browser smoke test (webapp-testing skill, `npm run dev`): open widget, ask the
   screenshot question + 5 others, confirm real answers.
4. Commit to `master`, push to `Optinet-Solutions-AI/GRG-Dashboard` (remote `origin`,
   Git Credential Manager). Vercel auto-deploys `grg-dashboard.vercel.app`.
5. Confirm deploy succeeded; report eval results + live URL.

## Out of scope (YAGNI)

- No LLM / API integration of any kind.
- No multi-turn conversation memory ("what about Qatar?" follow-ups) — single-shot Q&A.
- No new DB tables or migrations — strictly read existing data.
- No UI redesign of the widget (logic only; the chat bubble rendering is fine).

## Risks & mitigations

- **Over-eager fuzzy matching → confident wrong answers.** Mitigate: fuzz only topic
  *trigger words*, never entities (countries/keywords matched exactly); conservative
  Levenshtein thresholds; eval includes out-of-domain negatives.
- **Stemmer over-stripping** (e.g. "address" → "address" ok, but watch false collapses).
  Mitigate: min-length guard + unit tests on the stem function itself.
- **Empty / no data in client DB** — every handler already has a "no data yet" branch; keep that.
- **Deploy regression** — gated behind full test + build + manual smoke before push.

## Testing summary

| Layer | File | Asserts |
|-------|------|---------|
| Stemmer/fuzzy/tokenize units | `nlu.test.ts` (extend) | pure-function correctness |
| Intent parsing eval | `nlu.eval.test.ts` (new) | ≥95% of 80–120 labelled Qs |
| Answer shape | `smart.eval.test.ts` (new) | header/URLs/count/cap vs mocked DB |
| Preset-chip path | `match.test.ts` (unchanged) | no regression |

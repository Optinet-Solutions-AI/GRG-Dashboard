# Phase 5: Tokenless Assistant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deterministic, tokenless assistant that answers a fixed catalog of performance questions by querying dashboard data and filling templated answers — behind an `InsightProvider` interface so an LLM provider can be added later without touching the UI.

**Architecture:** Pure insight functions (no IO, unit-tested) compute answers from typed inputs. A `RuleProvider` (`server-only`) gathers data via Supabase/RPCs, calls the pure functions, and returns strings. A `getInsightProvider()` factory returns the rule provider by default; an `llmProvider` stub marks the seam. A canned-question panel on Overview calls a `requireUser`-gated Server Action (viewers may ask — it is read-only).

**Tech Stack:** TypeScript (pure functions), Next.js Server Actions, Supabase queries/RPCs, Vitest. **No LLM, no network, no tokens.**

> **Depends on Phases 1–4.** Uses the schema + RPCs (ranking, pagespeed, health, etc.) and the Overview page (mount point).

---

## File Structure (this phase)

- `src/lib/assistant/types.ts` — `QuestionId`, `AssistantContext`, `InsightProvider`
- `src/lib/assistant/questions.ts` — the canned-question catalog
- `src/lib/assistant/insights.ts` — pure compute functions (no IO; unit-tested)
- `src/lib/assistant/insights.test.ts` — TDD for the pure functions
- `src/lib/assistant/rule-provider.ts` — `RuleProvider` (`server-only`)
- `src/lib/assistant/llm-provider.ts` — `LlmProvider` stub (seam)
- `src/lib/assistant/provider.ts` — `getInsightProvider()` factory
- `src/app/(app)/assistant/actions.ts` — `askAssistant` Server Action
- `src/components/assistant/AssistantPanel.tsx` — canned-question panel
- `src/app/(app)/page.tsx` — mount the panel (additive edit)

---

## Task 1: Types + question catalog

**Files:**
- Create: `src/lib/assistant/types.ts`, `src/lib/assistant/questions.ts`

- [ ] **Step 1: Define the provider interface + types**

Create `src/lib/assistant/types.ts`:
```ts
export type QuestionId =
  | "top-mover-week"
  | "missing-or-stale"
  | "pagespeed-trend"
  | "health-summary";

export interface AssistantContext {
  siteId?: string | null;
}

export interface InsightProvider {
  readonly id: string;
  answer(questionId: QuestionId, ctx: AssistantContext): Promise<string>;
}
```

- [ ] **Step 2: Define the catalog**

Create `src/lib/assistant/questions.ts`:
```ts
import type { QuestionId } from "./types";

export const QUESTIONS: { id: QuestionId; label: string }[] = [
  { id: "top-mover-week", label: "Which site improved most this week?" },
  { id: "missing-or-stale", label: "What data is missing or stale?" },
  { id: "pagespeed-trend", label: "Is PageSpeed up or down vs last period?" },
  { id: "health-summary", label: "Give me a health summary" },
];
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/assistant/types.ts src/lib/assistant/questions.ts
git commit -m "feat: assistant provider interface + question catalog"
```

---

## Task 2: Pure insight functions (TDD)

**Files:**
- Create: `src/lib/assistant/insights.ts`, `src/lib/assistant/insights.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/assistant/insights.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { topRankingMover, staleSections, trendDirection } from "./insights";

describe("topRankingMover", () => {
  it("picks the site with the largest net of improved keyword positions", () => {
    const rows = [
      { site: "A", position: 5, prevPosition: 9 },   // improved (+1)
      { site: "A", position: 12, prevPosition: 8 },  // worse (-1)  => A net 0
      { site: "B", position: 3, prevPosition: 7 },   // improved (+1)
      { site: "B", position: 2, prevPosition: 6 },   // improved (+1) => B net 2
    ];
    expect(topRankingMover(rows)).toEqual({ site: "B", net: 2 });
  });
  it("ignores rows with a null position on either side", () => {
    const rows = [
      { site: "A", position: null, prevPosition: 5 },
      { site: "A", position: 4, prevPosition: null },
    ];
    expect(topRankingMover(rows)).toBeNull();
  });
});

describe("staleSections", () => {
  it("flags sections with no data or older than the threshold", () => {
    const rows = [
      { section: "SEO", latest: "2026-06-07" },     // 1 day old -> fresh
      { section: "Health", latest: null },          // missing -> stale
      { section: "Backlinks", latest: "2026-05-01" }, // old -> stale
    ];
    expect(staleSections(rows, "2026-06-08", 14)).toEqual(["Health", "Backlinks"]);
  });
});

describe("trendDirection", () => {
  it("compares the two most recent periods", () => {
    const pts = [
      { date: "2026-05-01", score: 80 },
      { date: "2026-06-01", score: 88 },
    ];
    expect(trendDirection(pts)).toEqual({ dir: "up", delta: 8 });
  });
  it("returns n/a with fewer than two valid points", () => {
    expect(trendDirection([{ date: "2026-06-01", score: 88 }])).toEqual({ dir: "n/a", delta: null });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/lib/assistant/insights.test.ts
```
Expected: FAIL — `./insights` not found.

- [ ] **Step 3: Implement the pure functions**

Create `src/lib/assistant/insights.ts`:
```ts
export interface RankMoveRow {
  site: string;
  position: number | null;
  prevPosition: number | null;
}

/** Net keyword improvements per site (lower position = better); returns the best site. */
export function topRankingMover(rows: RankMoveRow[]): { site: string; net: number } | null {
  const bySite = new Map<string, number>();
  for (const r of rows) {
    if (r.position == null || r.prevPosition == null) continue;
    const delta = r.prevPosition - r.position; // positive = improved (moved to a lower number)
    bySite.set(r.site, (bySite.get(r.site) ?? 0) + Math.sign(delta));
  }
  let best: { site: string; net: number } | null = null;
  for (const [site, net] of bySite) {
    if (best === null || net > best.net) best = { site, net };
  }
  return best;
}

export interface SectionFreshness {
  section: string;
  latest: string | null; // ISO date or null
}

/** Sections with no data, or whose latest entry is older than `staleDays`. */
export function staleSections(rows: SectionFreshness[], today: string, staleDays: number): string[] {
  const todayMs = Date.parse(today);
  const out: string[] = [];
  for (const r of rows) {
    if (!r.latest) {
      out.push(r.section);
      continue;
    }
    const ageDays = (todayMs - Date.parse(r.latest)) / 86_400_000;
    if (ageDays > staleDays) out.push(r.section);
  }
  return out;
}

export interface ScorePoint {
  date: string;
  score: number | null;
}

/** Direction of the latest period vs the previous, over valid points. */
export function trendDirection(points: ScorePoint[]): {
  dir: "up" | "down" | "flat" | "n/a";
  delta: number | null;
} {
  const valid = points
    .filter((p): p is { date: string; score: number } => typeof p.score === "number")
    .sort((a, b) => a.date.localeCompare(b.date));
  if (valid.length < 2) return { dir: "n/a", delta: null };
  const last = valid[valid.length - 1].score;
  const prev = valid[valid.length - 2].score;
  const delta = last - prev;
  return { dir: delta > 0 ? "up" : delta < 0 ? "down" : "flat", delta };
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npx vitest run src/lib/assistant/insights.test.ts
```
Expected: PASS (all 6 cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/assistant/insights.ts src/lib/assistant/insights.test.ts
git commit -m "feat: pure assistant insight functions (TDD)"
```

---

## Task 3: Rule provider + LLM seam + factory

**Files:**
- Create: `src/lib/assistant/rule-provider.ts`, `src/lib/assistant/llm-provider.ts`, `src/lib/assistant/provider.ts`

- [ ] **Step 1: Implement the rule provider**

Create `src/lib/assistant/rule-provider.ts`:
```ts
import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AssistantContext, InsightProvider, QuestionId } from "./types";
import {
  topRankingMover,
  staleSections,
  trendDirection,
  type RankMoveRow,
  type SectionFreshness,
  type ScorePoint,
} from "./insights";

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type SB = Awaited<ReturnType<typeof createServerSupabaseClient>>;

async function maxDate(sb: SB, table: string, col: string): Promise<string | null> {
  const { data } = await sb.from(table).select(col).order(col, { ascending: false }).limit(1);
  const row = (data ?? [])[0] as Record<string, string> | undefined;
  return row ? (row[col] ?? null) : null;
}

async function answerTopMover(sb: SB): Promise<string> {
  const { data: weeks } = await sb.rpc("ranking_weeks");
  const wk = (weeks ?? []) as { week_date: string }[];
  if (wk.length < 2) return "Not enough ranking history yet — add at least two weeks to compare.";
  const [latest, prev] = [wk[0].week_date, wk[1].week_date];
  const { data } = await sb
    .from("rankings")
    .select("week_date, position, site_id, country_id, keyword_id, sites!inner(display_name)")
    .in("week_date", [latest, prev]);
  const rows = (data ?? []) as Array<{
    week_date: string; position: number | null; site_id: string; country_id: string;
    keyword_id: string; sites: { display_name: string };
  }>;
  const pair = new Map<string, { site: string; latest: number | null; prev: number | null }>();
  for (const r of rows) {
    const k = `${r.site_id}|${r.country_id}|${r.keyword_id}`;
    const e = pair.get(k) ?? { site: r.sites.display_name, latest: null, prev: null };
    if (r.week_date === latest) e.latest = r.position;
    else e.prev = r.position;
    pair.set(k, e);
  }
  const moveRows: RankMoveRow[] = [...pair.values()].map((e) => ({
    site: e.site, position: e.latest, prevPosition: e.prev,
  }));
  const best = topRankingMover(moveRows);
  if (!best || best.net <= 0) return `Between ${prev} and ${latest}, no site showed a clear net improvement.`;
  return `Between ${prev} and ${latest}, “${best.site}” improved the most (net ${best.net} keyword position gain${best.net === 1 ? "" : "s"}).`;
}

async function answerStale(sb: SB): Promise<string> {
  const today = todayLocal();
  const rows: SectionFreshness[] = [
    { section: "SEO", latest: await maxDate(sb, "seo_scores", "date") },
    { section: "Health", latest: await maxDate(sb, "health_snapshots", "date") },
    { section: "PageSpeed", latest: await maxDate(sb, "pagespeed_entries", "date") },
    { section: "Ranking", latest: await maxDate(sb, "rankings", "week_date") },
    { section: "Backlinks", latest: await maxDate(sb, "backlinks", "date") },
  ];
  const stale = staleSections(rows, today, 14);
  if (stale.length === 0) return "All sections have data updated within the last 14 days. Nothing stale.";
  return `These sections are missing or stale (no update in 14+ days): ${stale.join(", ")}.`;
}

async function answerPageSpeedTrend(sb: SB): Promise<string> {
  const { data } = await sb
    .from("pagespeed_entries")
    .select("date, mobile_score, desktop_score")
    .order("date", { ascending: false })
    .limit(200);
  const byDate = new Map<string, { sum: number; n: number }>();
  for (const r of (data ?? []) as Array<{ date: string; mobile_score: number | null; desktop_score: number | null }>) {
    const vals = [r.mobile_score, r.desktop_score].filter((v): v is number => typeof v === "number");
    if (vals.length === 0) continue;
    const acc = byDate.get(r.date) ?? { sum: 0, n: 0 };
    acc.sum += vals.reduce((a, b) => a + b, 0);
    acc.n += vals.length;
    byDate.set(r.date, acc);
  }
  const points: ScorePoint[] = [...byDate.entries()].map(([date, a]) => ({ date, score: Math.round(a.sum / a.n) }));
  const t = trendDirection(points);
  if (t.dir === "n/a") return "Not enough PageSpeed history to compare periods yet.";
  if (t.dir === "flat") return "PageSpeed is flat versus the previous period (no change in the average score).";
  return `PageSpeed is ${t.dir} ${Math.abs(t.delta ?? 0)} point${Math.abs(t.delta ?? 0) === 1 ? "" : "s"} versus the previous period (average mobile+desktop).`;
}

async function answerHealthSummary(sb: SB, siteId?: string | null): Promise<string> {
  let q = sb
    .from("health_snapshots")
    .select("date, domain_rating, referring_domains, organic_traffic, organic_keywords, site_id, sites!inner(display_name)")
    .order("date", { ascending: false })
    .limit(1);
  if (siteId) q = q.eq("site_id", siteId);
  const { data } = await q;
  const r = (data ?? [])[0] as
    | { date: string; domain_rating: number | null; referring_domains: number | null; organic_traffic: number | null; organic_keywords: number | null; sites: { display_name: string } }
    | undefined;
  if (!r) return "No health snapshot recorded yet.";
  return `Latest health for “${r.sites.display_name}” (${r.date}): DR ${r.domain_rating ?? "—"}, ${r.referring_domains ?? "—"} referring domains, ${r.organic_traffic ?? "—"} organic traffic, ${r.organic_keywords ?? "—"} organic keywords.`;
}

export const ruleProvider: InsightProvider = {
  id: "rule",
  async answer(questionId: QuestionId, ctx: AssistantContext): Promise<string> {
    const sb = await createServerSupabaseClient();
    switch (questionId) {
      case "top-mover-week": return answerTopMover(sb);
      case "missing-or-stale": return answerStale(sb);
      case "pagespeed-trend": return answerPageSpeedTrend(sb);
      case "health-summary": return answerHealthSummary(sb, ctx.siteId);
      default: return "I don't have an answer for that question.";
    }
  },
};
```

- [ ] **Step 2: Implement the LLM seam stub**

Create `src/lib/assistant/llm-provider.ts`:
```ts
import "server-only";
import type { InsightProvider } from "./types";

/** Seam for a future free-form LLM provider (e.g. Claude). Intentionally inert. */
export const llmProvider: InsightProvider = {
  id: "llm",
  async answer() {
    throw new Error("LLM provider not configured. Implement a client and set ASSISTANT_PROVIDER=llm.");
  },
};
```

- [ ] **Step 3: Implement the factory**

Create `src/lib/assistant/provider.ts`:
```ts
import "server-only";
import type { InsightProvider } from "./types";
import { ruleProvider } from "./rule-provider";
// import { llmProvider } from "./llm-provider"; // enable when an LLM is configured

/** Tokenless rule provider by default. Swap here when an LLM provider is wired. */
export function getInsightProvider(): InsightProvider {
  return ruleProvider;
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/assistant/rule-provider.ts src/lib/assistant/llm-provider.ts src/lib/assistant/provider.ts
git commit -m "feat: tokenless rule provider + LLM seam + factory"
```

---

## Task 4: Server Action + panel + mount on Overview

**Files:**
- Create: `src/app/(app)/assistant/actions.ts`, `src/components/assistant/AssistantPanel.tsx`
- Modify: `src/app/(app)/page.tsx`

- [ ] **Step 1: Implement the Server Action**

Create `src/app/(app)/assistant/actions.ts`:
```ts
"use server";

import { requireUser } from "@/lib/auth";
import { getInsightProvider } from "@/lib/assistant/provider";
import type { QuestionId } from "@/lib/assistant/types";

const VALID: QuestionId[] = ["top-mover-week", "missing-or-stale", "pagespeed-trend", "health-summary"];

export async function askAssistant(
  _prev: { answer?: string; error?: string } | undefined,
  formData: FormData,
): Promise<{ answer?: string; error?: string }> {
  await requireUser();
  const questionId = String(formData.get("questionId") ?? "") as QuestionId;
  if (!VALID.includes(questionId)) return { error: "Unknown question." };
  const siteId = String(formData.get("siteId") ?? "") || null;
  try {
    const answer = await getInsightProvider().answer(questionId, { siteId });
    return { answer };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not answer that." };
  }
}
```

- [ ] **Step 2: Implement the panel**

Create `src/components/assistant/AssistantPanel.tsx`:
```tsx
"use client";

import { useActionState } from "react";
import { askAssistant } from "@/app/(app)/assistant/actions";
import { QUESTIONS } from "@/lib/assistant/questions";

export function AssistantPanel({ siteId }: { siteId?: string | null }) {
  const [state, action, pending] = useActionState(askAssistant, undefined);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Assistant</h2>
      <form action={action} className="flex flex-wrap gap-2">
        <input type="hidden" name="siteId" value={siteId ?? ""} />
        {QUESTIONS.map((q) => (
          <button key={q.id} type="submit" name="questionId" value={q.id} disabled={pending}
            className="rounded-full border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {q.label}
          </button>
        ))}
      </form>
      <div className="mt-3 min-h-[1.5rem] text-sm">
        {pending ? <span className="text-slate-400">Thinking…</span> : null}
        {state?.answer ? <p className="text-slate-800">{state.answer}</p> : null}
        {state?.error ? <p className="text-red-600">{state.error}</p> : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Mount the panel on Overview (admin + viewer)**

Edit `src/app/(app)/page.tsx`. Add the import:
```tsx
import { AssistantPanel } from "@/components/assistant/AssistantPanel";
```
The Overview page reads the current site from `searchParams` (the `?site=` filter, same pattern as the SEO page: `const { site } = await searchParams;`). Render the panel near the top of the returned JSX, passing that value:
```tsx
<AssistantPanel siteId={site ?? null} />
```
If the Overview page does not already destructure `searchParams`, add the same `{ searchParams }: { searchParams: Promise<{ site?: string }> }` signature and `const { site } = await searchParams;` used by the SEO page, then pass `site ?? null`.

- [ ] **Step 4: Build + manual verify (both roles)**

```bash
npx tsc --noEmit && npm run build && npm run dev
```
As admin on `/`: click each chip. Expected (on a lightly-populated DB): "top mover" needs ≥2 ranking weeks (else the "not enough history" message); "missing or stale" lists sections without recent data; "PageSpeed trend" needs ≥2 PageSpeed dates; "health summary" shows the latest snapshot or "No health snapshot recorded yet." Confirm answers come back instantly with **no network/LLM calls** (watch the network tab — only the local Server Action POST). Repeat as viewer: the panel works identically (read-only). Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: assistant panel + askAssistant action mounted on Overview"
```

---

## Self-Review (completed during planning)

- **Spec coverage (Phase 5 scope):** tokenless deterministic engine ✓ (rule provider + pure functions); bounded question catalog ✓ (top mover, stale data, PageSpeed trend, health summary); `InsightProvider` seam with `llmProvider` stub + factory ✓ (LLM-ready without UI changes); panel on Overview, available to both roles ✓.
- **Tokenless guarantee:** no LLM import is active; the factory returns `ruleProvider`; all answers come from SQL + pure functions. The manual step says to confirm no external calls fire.
- **Testability:** the risky logic (mover/staleness/trend math) is pure and TDD-tested; the DB-gathering provider is integration/manual-verified.
- **Row-cap awareness:** queries are scoped/limited (`limit(1)` for max-dates, `limit(200)` for PageSpeed history, `ranking_weeks()` RPC for the two latest weeks) — never an unbounded full-table fetch.
- **Placeholder scan:** complete code in every step; the one page edit names the exact insertion (`searchParams.site` → `<AssistantPanel siteId=... />`) and the fallback if the signature is missing.
- **Type consistency:** `QuestionId` union identical in types/questions/action/`VALID`; `RankMoveRow`/`SectionFreshness`/`ScorePoint` shapes match the pure functions; `getInsightProvider()`/`InsightProvider.answer` signatures consistent; `askAssistant` `(prev, formData)` matches `useActionState`.

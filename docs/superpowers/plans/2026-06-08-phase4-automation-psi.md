# Phase 4: Automation Seam + Live PageSpeed Insights — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `MetricSource` adapter seam, implement **PageSpeed Insights** as the one live auto-fill (free, no auth required), expose an admin-only "Auto-fill from PSI" control on the PageSpeed page, stub a weekly-ranking cron seam, and write the automation roadmap doc.

**Architecture:** Automation is **additive** — manual entry (Phase 3) always works; an adapter merely pre-fills a section. The pure PSI response parser lives in its own file (no `server-only`, no network) so it is unit-testable; the network adapter wraps it. A Server Action calls the adapter and upserts into `pagespeed_entries`.

**Tech Stack:** PageSpeed Insights API v5 (REST), Next.js Server Actions + Route Handlers, Vitest.

> **Depends on Phases 1–3.** Needs at least one PageSpeed URL configured in Manage and the `pagespeed_entries` table (migration 0002). The live test (Task 3 Step 4) needs internet access from the dev machine.

---

## File Structure (this phase)

- `src/lib/sources/types.ts` — `MetricSource` + PageSpeed types (no `server-only`)
- `src/lib/sources/parse-psi.ts` — pure `parsePsiScore` (no `server-only`, unit-tested)
- `src/lib/sources/parse-psi.test.ts` — TDD for the parser
- `src/lib/sources/pagespeed-insights.ts` — network adapter (`server-only`)
- `src/app/(app)/pagespeed/autofill-actions.ts` — `autofillPagespeed` Server Action
- `src/components/sources/PsiAutofillButton.tsx` — admin-only client control
- `src/app/(app)/pagespeed/page.tsx` — mount the button (additive edit)
- `src/app/api/cron/ranking/route.ts` — weekly-ranking cron seam (inert stub)
- `docs/automation-roadmap.md` — per-section automation map
- `.env.local.example` / `.env.local` — add optional `PAGESPEED_API_KEY`

---

## Task 1: The source seam + PSI parser (TDD)

**Files:**
- Create: `src/lib/sources/types.ts`, `src/lib/sources/parse-psi.ts`, `src/lib/sources/parse-psi.test.ts`

- [ ] **Step 1: Define the source interface + types**

Create `src/lib/sources/types.ts`:
```ts
export type Strategy = "mobile" | "desktop";

export interface PageSpeedResult {
  strategy: Strategy;
  score: number | null; // 0–100, or null if unavailable
}

/** Base marker for any data-source adapter (manual sections need no adapter). */
export interface MetricSource {
  readonly id: string;
}

/** A source that returns PageSpeed performance scores for a URL. */
export interface PageSpeedSource extends MetricSource {
  fetchScores(url: string): Promise<PageSpeedResult[]>;
}
```

- [ ] **Step 2: Write the failing parser test**

Create `src/lib/sources/parse-psi.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parsePsiScore } from "./parse-psi";

describe("parsePsiScore", () => {
  it("converts a 0..1 performance score to 0..100", () => {
    expect(parsePsiScore({ lighthouseResult: { categories: { performance: { score: 0.98 } } } })).toBe(98);
  });
  it("rounds to the nearest integer", () => {
    expect(parsePsiScore({ lighthouseResult: { categories: { performance: { score: 0.736 } } } })).toBe(74);
  });
  it("treats a zero score as 0, not missing", () => {
    expect(parsePsiScore({ lighthouseResult: { categories: { performance: { score: 0 } } } })).toBe(0);
  });
  it("returns null when the score is absent", () => {
    expect(parsePsiScore({})).toBeNull();
    expect(parsePsiScore({ error: { message: "rate limited" } })).toBeNull();
    expect(parsePsiScore(null)).toBeNull();
  });
  it("returns null when the score is not a number", () => {
    expect(parsePsiScore({ lighthouseResult: { categories: { performance: { score: "x" } } } })).toBeNull();
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

```bash
npx vitest run src/lib/sources/parse-psi.test.ts
```
Expected: FAIL — `./parse-psi` not found.

- [ ] **Step 4: Implement the pure parser**

Create `src/lib/sources/parse-psi.ts`:
```ts
/** Extract the Lighthouse performance score (0..1) from a PSI v5 response and scale to 0..100. */
export function parsePsiScore(json: unknown): number | null {
  const score = (json as {
    lighthouseResult?: { categories?: { performance?: { score?: unknown } } };
  })?.lighthouseResult?.categories?.performance?.score;
  if (typeof score !== "number" || Number.isNaN(score)) return null;
  return Math.round(score * 100);
}
```

- [ ] **Step 5: Run it to confirm it passes**

```bash
npx vitest run src/lib/sources/parse-psi.test.ts
```
Expected: PASS (all 5 cases). Note the zero-score case proves we don't treat `0` as missing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sources/types.ts src/lib/sources/parse-psi.ts src/lib/sources/parse-psi.test.ts
git commit -m "feat: add MetricSource types + PSI score parser (TDD)"
```

---

## Task 2: PSI network adapter

**Files:**
- Create: `src/lib/sources/pagespeed-insights.ts`
- Modify: `.env.local.example`, `.env.local`

- [ ] **Step 1: Implement the adapter**

Create `src/lib/sources/pagespeed-insights.ts`:
```ts
import "server-only";
import type { PageSpeedSource, PageSpeedResult, Strategy } from "./types";
import { parsePsiScore } from "./parse-psi";

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

async function fetchStrategy(url: string, strategy: Strategy): Promise<PageSpeedResult> {
  const params = new URLSearchParams({ url, strategy, category: "performance" });
  const key = process.env.PAGESPEED_API_KEY;
  if (key) params.set("key", key);
  try {
    const res = await fetch(`${ENDPOINT}?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) return { strategy, score: null };
    return { strategy, score: parsePsiScore(await res.json()) };
  } catch {
    return { strategy, score: null };
  }
}

export const pageSpeedInsights: PageSpeedSource = {
  id: "pagespeed-insights",
  async fetchScores(url: string): Promise<PageSpeedResult[]> {
    return Promise.all([fetchStrategy(url, "mobile"), fetchStrategy(url, "desktop")]);
  },
};
```

- [ ] **Step 2: Document the optional API key**

Append to `.env.local.example`:
```
# Optional: raises PageSpeed Insights quota. PSI works without a key at low volume.
PAGESPEED_API_KEY=
```
Add the same (blank, or your key) to `.env.local`.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no type errors. (No unit test here — network IO is covered by the live test in Task 3.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/sources/pagespeed-insights.ts .env.local.example
git commit -m "feat: add PageSpeed Insights network adapter"
```

---

## Task 3: Auto-fill Server Action + admin control

**Files:**
- Create: `src/app/(app)/pagespeed/autofill-actions.ts`, `src/components/sources/PsiAutofillButton.tsx`
- Modify: `src/app/(app)/pagespeed/page.tsx`

- [ ] **Step 1: Implement the Server Action**

Create `src/app/(app)/pagespeed/autofill-actions.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { pageSpeedInsights } from "@/lib/sources/pagespeed-insights";

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function autofillPagespeed(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData,
) {
  await requireAdmin();
  const pagespeedUrlId = String(formData.get("pagespeed_url_id") ?? "").trim();
  if (!pagespeedUrlId) return { error: "Pick a PageSpeed URL." };

  const supabase = await createServerSupabaseClient();
  const { data: row, error: e1 } = await supabase
    .from("pagespeed_urls")
    .select("url")
    .eq("id", pagespeedUrlId)
    .single();
  if (e1 || !row) return { error: "URL not found." };

  const results = await pageSpeedInsights.fetchScores(row.url as string);
  const mobile = results.find((r) => r.strategy === "mobile")?.score ?? null;
  const desktop = results.find((r) => r.strategy === "desktop")?.score ?? null;
  if (mobile === null && desktop === null) {
    return { error: "PSI returned no scores (rate-limited or URL unreachable)." };
  }

  const { error: e2 } = await supabase.from("pagespeed_entries").upsert(
    { pagespeed_url_id: pagespeedUrlId, date: todayLocal(), mobile_score: mobile, desktop_score: desktop },
    { onConflict: "pagespeed_url_id,date" },
  );
  if (e2) return { error: e2.message };
  revalidatePath("/pagespeed");
  return { ok: true };
}
```

- [ ] **Step 2: Implement the admin-only client control**

Create `src/components/sources/PsiAutofillButton.tsx`:
```tsx
"use client";

import { useActionState } from "react";
import { autofillPagespeed } from "@/app/(app)/pagespeed/autofill-actions";

type UrlOption = { id: string; url: string; label?: string | null };

export function PsiAutofillButton({ urls }: { urls: UrlOption[] }) {
  const [state, action, pending] = useActionState(autofillPagespeed, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <span className="text-sm font-medium text-slate-700">Auto-fill (PageSpeed Insights):</span>
      <select name="pagespeed_url_id" required className="rounded-md border border-slate-300 px-2 py-1 text-sm">
        <option value="">Select URL…</option>
        {urls.map((u) => (
          <option key={u.id} value={u.id}>{u.label || u.url}</option>
        ))}
      </select>
      <button type="submit" disabled={pending}
        className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
        {pending ? "Fetching…" : "Auto-fill from PSI"}
      </button>
      {state?.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
      {state?.ok ? <span className="text-sm text-green-700">Saved today’s scores ✓</span> : null}
    </form>
  );
}
```

- [ ] **Step 3: Mount the control on the PageSpeed page (admin only)**

Edit `src/app/(app)/pagespeed/page.tsx`. Add the import at the top:
```tsx
import { PsiAutofillButton } from "@/components/sources/PsiAutofillButton";
```
Inside the existing `if (isAdmin) { ... }` block (where the page already loads PageSpeed URLs for `AddPagespeedPeriod`), fetch the active URLs (reuse the existing query if present) and render the button. If the admin block does not already have the URL list, add:
```tsx
const { data: psiUrls } = await supabase
  .from("pagespeed_urls")
  .select("id, url, label")
  .eq("active", true)
  .order("sort_order");
```
Then include `<PsiAutofillButton urls={psiUrls ?? []} />` in the admin-only JSX (e.g. directly above the `<AddPagespeedPeriod .../>` element). Viewers never reach this branch.

- [ ] **Step 4: Build, then live-test against the local DB + real PSI**

```bash
npx tsc --noEmit && npm run build && npm run dev
```
As admin on `/pagespeed`: ensure a PageSpeed URL exists in Manage with a **real, public** URL (e.g. `https://example.com`). Select it and click **Auto-fill from PSI**. Expected: after a few seconds, "Saved today's scores ✓" and a new row appears in the PageSpeed table with mobile/desktop numbers. If you see the rate-limited message, retry (set `PAGESPEED_API_KEY` to raise quota). Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: PSI auto-fill server action + admin control on PageSpeed"
```

---

## Task 4: Weekly-ranking cron seam (inert stub)

**Files:**
- Create: `src/app/api/cron/ranking/route.ts`

- [ ] **Step 1: Create the inert cron route**

Create `src/app/api/cron/ranking/route.ts`:
```ts
import { NextResponse } from "next/server";

// SEAM — weekly ranking automation. Rankings are entered manually today (Phase 3).
// To activate (see docs/automation-roadmap.md):
//   1. Implement a ranking MetricSource (DataForSEO SERP, or GSC for own verified sites).
//   2. Here: for each active site, fetch this ISO week's positions and upsert into `rankings`
//      with `week_date` = the week's Monday, matching the (week_date, site, country, keyword) unique key.
//   3. Add a Vercel Cron entry to vercel.json:
//        { "crons": [{ "path": "/api/cron/ranking", "schedule": "0 6 * * 1" }] }
//   4. Protect this route with a CRON_SECRET check before going live.
export async function GET() {
  return NextResponse.json(
    { ok: false, reason: "ranking automation not configured (manual entry active)" },
    { status: 501 },
  );
}
```

- [ ] **Step 2: Build + verify the route returns 501**

```bash
npm run build && npm run dev
```
In another shell: `curl -i http://localhost:3000/api/cron/ranking` → expect HTTP `501` with the JSON reason. Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/ranking/route.ts
git commit -m "chore: add inert weekly-ranking cron seam"
```

---

## Task 5: Automation roadmap doc

**Files:**
- Create: `docs/automation-roadmap.md`

- [ ] **Step 1: Write the roadmap**

Create `docs/automation-roadmap.md`:
```markdown
# Automation Roadmap

Manual entry is the default for every section. Automation is additive: a `MetricSource`
adapter pre-fills what an admin would otherwise type. Implemented live: **PageSpeed Insights**.

| Section | Source | Cost | Auth | Status | How to wire |
|---|---|---|---|---|---|
| PageSpeed | PSI API v5 | Free | none / optional key | **Live** | `src/lib/sources/pagespeed-insights.ts` + `autofillPagespeed` action |
| Ranking (weekly) | DataForSEO SERP, or GSC for own verified sites | Paid / Free | API key / OAuth | Seam stub | Implement a ranking source; call it from `src/app/api/cron/ranking/route.ts`; add a Vercel Cron entry |
| Health (DR, ref domains, traffic, keywords) | Ahrefs API or DataForSEO | Paid | API key | Planned | New `HealthSource.fetch(siteUrl)`; action upserts `health_snapshots` |
| SEO Score (Rankmath /100) | Rankmath REST (WordPress only) | Free | site creds | Planned | New `SeoScoreSource`; per-site fetch → `seo_scores` |
| Backlinks | DataForSEO / Moz / Common Crawl | Free-limited / Paid | API key | Planned | New `BacklinkSource`; bulk insert `backlinks` |
| Analytics (comparison) | GA4 Data API | Free | OAuth | Pending structure | Section is inert until its structure is supplied |
| QA checklist | Playwright automated checks | Free | none | Planned (partial) | Headless checks per `qa_pages` × `qa_elements`; upsert `qa_checks` |

## The adapter contract
Add `XSource extends MetricSource` in `src/lib/sources/types.ts`, implement it in
`src/lib/sources/<name>.ts` (with `import "server-only"` and the pure parsing in a
separate `parse-*.ts` so it stays unit-testable), then call it from a `requireAdmin`-gated
Server Action that upserts into the section's table on its unique key.

## Cron activation
Vercel Cron hits a Route Handler on a schedule. Guard the route with a `CRON_SECRET`
header check. Locally, a cron can be simulated by calling the route directly.
```

- [ ] **Step 2: Commit**

```bash
git add docs/automation-roadmap.md
git commit -m "docs: automation roadmap (per-section source map)"
```

---

## Self-Review (completed during planning)

- **Spec coverage (Phase 4 scope):** `MetricSource` seam ✓ (Task 1 types); PSI live auto-fill ✓ (Tasks 2–3); weekly-ranking cron seam ✓ (Task 4); roadmap doc ✓ (Task 5).
- **Testability:** pure parser isolated in `parse-psi.ts` (no `server-only`, no network) so the TDD test has a clean import graph — avoids the `server-only` import tripping Vitest.
- **Zero-score correctness:** the parser test explicitly proves `score: 0 → 0` (not null), the classic falsy-zero bug.
- **Additive guarantee:** manual entry from Phase 3 is untouched; the button only inserts; viewers never reach the admin branch; the cron route is inert (501) until wired.
- **Placeholder scan:** no vague steps; every step has complete code or an exact command + expected output. The page edit names a concrete insertion point (`if (isAdmin)` block) and supplies the exact query + JSX.
- **Type consistency:** `PageSpeedSource.fetchScores`, `PageSpeedResult.{strategy,score}`, `pageSpeedInsights.id`, `autofillPagespeed` signature, and `PsiAutofillButton` props are consistent across tasks; upsert `onConflict: "pagespeed_url_id,date"` matches the `unique (pagespeed_url_id, date)` constraint in migration 0002.

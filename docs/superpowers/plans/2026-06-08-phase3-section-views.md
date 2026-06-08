# Phase 3: Section Views, Data Entry & Analytics Placeholder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Overview + six section views (SEO, Health, PageSpeed, Ranking, Backlinks, QA) with inline admin data entry, Recharts trends, screenshot uploads, and the site selector; then add a new inert **Analytics** placeholder section.

**Architecture:** These files contain **no brand strings** (confirmed by grep), so they port verbatim from the reference. Tasks group the copies by area, each ending in a typecheck/build and (where a unit test exists) a test run. The only net-new code is the Analytics placeholder and its nav entry.

**Tech Stack:** Next.js Server Components + Server Actions, Recharts, Supabase Storage, Vitest.

> **Depends on Phases 1–2.** The `(app)` layout is auth-guarded; at least one site, keyword, country, and PageSpeed URL should exist in Manage (added in Phase 2 Task 4) so the views render real rows.

---

## File Structure (this phase)

Ported from the reference (all under the `(app)` group + shared components/libs):
- Pages+actions: `(app)/page.tsx`; `(app)/{seo,health,pagespeed,ranking,backlinks,qa}/page.tsx` + `actions.ts`
- Shared components: `StatCard.tsx`, `SiteSelector.tsx`, `ScreenshotInput.tsx`, `charts/TrendChart.tsx`
- Entry components: `entry/{AddSeoPeriod,AddPagespeedPeriod,AddRankingWeek}.tsx`
- Ranking components: `ranking/{RankingGrid,WeekSelector}.tsx`
- Section components: `sections/{AddBacklink,AddBacklinkSummary,HealthNumberForm,QaEditor,SummaryPeriodFilter}.tsx`
- Libs: `lib/data/{overview,ranking}.ts`, `lib/ranking/rank-cell.mjs` (+ `rank-cell.test.ts`), `lib/storage.ts`

Net-new:
- `src/app/(app)/analytics/page.tsx` — inert placeholder
- `src/lib/nav.ts` — add the Analytics tab (modify)
- `src/components/TopNav.test.tsx` — assert the Analytics tab (modify)

---

## Task 1: Shared components, data libs & ranking math (TDD checkpoint)

**Files:**
- Create (copy): `src/components/StatCard.tsx`, `src/components/SiteSelector.tsx`, `src/components/ScreenshotInput.tsx`, `src/components/charts/TrendChart.tsx`, `src/lib/data/overview.ts`, `src/lib/data/ranking.ts`, `src/lib/ranking/rank-cell.mjs`, `src/lib/ranking/rank-cell.test.ts`, `src/lib/storage.ts`

- [ ] **Step 1: Copy shared components + libs**

```bash
mkdir -p src/components/charts src/lib/data src/lib/ranking
cp .reference/trybet/src/components/StatCard.tsx        src/components/StatCard.tsx
cp .reference/trybet/src/components/SiteSelector.tsx    src/components/SiteSelector.tsx
cp .reference/trybet/src/components/ScreenshotInput.tsx src/components/ScreenshotInput.tsx
cp .reference/trybet/src/components/charts/TrendChart.tsx src/components/charts/TrendChart.tsx
cp .reference/trybet/src/lib/data/overview.ts          src/lib/data/overview.ts
cp .reference/trybet/src/lib/data/ranking.ts           src/lib/data/ranking.ts
cp .reference/trybet/src/lib/ranking/rank-cell.mjs     src/lib/ranking/rank-cell.mjs
cp .reference/trybet/src/lib/ranking/rank-cell.test.ts src/lib/ranking/rank-cell.test.ts
cp .reference/trybet/src/lib/storage.ts                src/lib/storage.ts
```

- [ ] **Step 2: Install Recharts**

```bash
npm install recharts
```

- [ ] **Step 3: Run the ranking-math test (the risky pure logic)**

```bash
npx vitest run src/lib/ranking/rank-cell.test.ts
```
Expected: PASS — movement arrows (▲/▼/NEW/no change) and color tiers (green ≤10, amber 11–100, red null) computed correctly. This is the highest-value test in the section layer; if it fails, fix `rank-cell.mjs` before continuing.

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit
git add -A
git commit -m "feat: port shared cards/charts/storage + ranking math"
```

---

## Task 2: Overview page

**Files:**
- Create (copy): `src/app/(app)/page.tsx` (overwrites the Phase-1 placeholder)

- [ ] **Step 1: Copy the Overview page**

```bash
cp ".reference/trybet/src/app/(app)/page.tsx" "src/app/(app)/page.tsx"
```
It calls the `dashboard_overview` + `rankings_top10_trend` RPCs (from migration 0006), renders `StatCard`s and a `TrendChart`, and respects the `?site=` filter.

- [ ] **Step 2: Build + manual check**

```bash
npm run build && npm run dev
```
As admin, open `/`. Expected: stat cards render (zeros/`—` are fine on an empty DB) and the page does not error. Switching the site selector updates the `?site=` query without error. Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: port Overview dashboard page"
```

---

## Task 3: SEO, Health & PageSpeed views + inline entry + screenshots

**Files:**
- Create (copy): `src/app/(app)/seo/{page.tsx,actions.ts}`, `src/app/(app)/health/{page.tsx,actions.ts}`, `src/app/(app)/pagespeed/{page.tsx,actions.ts}`, `src/components/entry/{AddSeoPeriod,AddPagespeedPeriod}.tsx`, `src/components/sections/{HealthNumberForm,AddBacklinkSummary,SummaryPeriodFilter}.tsx`

- [ ] **Step 1: Copy the three section pages + actions**

```bash
for s in seo health pagespeed; do
  cp ".reference/trybet/src/app/(app)/$s/page.tsx"   "src/app/(app)/$s/page.tsx"
  cp ".reference/trybet/src/app/(app)/$s/actions.ts" "src/app/(app)/$s/actions.ts"
done
```
(These overwrite the Phase-1 placeholders.)

- [ ] **Step 2: Copy the entry + section components they import**

```bash
mkdir -p src/components/entry src/components/sections
cp .reference/trybet/src/components/entry/AddSeoPeriod.tsx        src/components/entry/AddSeoPeriod.tsx
cp .reference/trybet/src/components/entry/AddPagespeedPeriod.tsx  src/components/entry/AddPagespeedPeriod.tsx
cp .reference/trybet/src/components/sections/HealthNumberForm.tsx src/components/sections/HealthNumberForm.tsx
cp .reference/trybet/src/components/sections/AddBacklinkSummary.tsx src/components/sections/AddBacklinkSummary.tsx
cp .reference/trybet/src/components/sections/SummaryPeriodFilter.tsx src/components/sections/SummaryPeriodFilter.tsx
```

- [ ] **Step 3: Typecheck + build**

```bash
npx tsc --noEmit && npm run build
```
Expected: no type errors; `/seo`, `/health`, `/pagespeed` routes build. If a copied page imports a component not yet copied, copy it from the matching `.reference/trybet/src/components/...` path and rebuild.

- [ ] **Step 4: Manual check — admin entry + screenshot upload**

```bash
npm run dev
```
As admin on `/seo`: "Add new period", enter scores for your site, save → row appears. On `/pagespeed`: add a period with mobile/desktop scores and upload a screenshot → it stores and renders (verifies Supabase Storage policies from 0004). On `/health`: enter Ahrefs numbers → they save. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: port SEO/Health/PageSpeed views + inline entry + screenshots"
```

---

## Task 4: Ranking view + weekly entry

**Files:**
- Create (copy): `src/app/(app)/ranking/{page.tsx,actions.ts}`, `src/components/ranking/{RankingGrid,WeekSelector}.tsx`, `src/components/entry/AddRankingWeek.tsx`

- [ ] **Step 1: Copy the ranking page, actions, and components**

```bash
mkdir -p src/components/ranking
cp ".reference/trybet/src/app/(app)/ranking/page.tsx"   "src/app/(app)/ranking/page.tsx"
cp ".reference/trybet/src/app/(app)/ranking/actions.ts" "src/app/(app)/ranking/actions.ts"
cp .reference/trybet/src/components/ranking/RankingGrid.tsx  src/components/ranking/RankingGrid.tsx
cp .reference/trybet/src/components/ranking/WeekSelector.tsx src/components/ranking/WeekSelector.tsx
cp .reference/trybet/src/components/entry/AddRankingWeek.tsx src/components/entry/AddRankingWeek.tsx
```
The page uses `ranking_weeks()` + `ranking_grid(site, week)` RPCs (migration 0007) and `rank-cell.mjs` for movement/color. `AddRankingWeek` pre-fills from the most recent week (per the data-entry design).

- [ ] **Step 2: Typecheck + build**

```bash
npx tsc --noEmit && npm run build
```
Expected: `/ranking` builds, no type errors.

- [ ] **Step 3: Manual check — add a week**

```bash
npm run dev
```
As admin on `/ranking`: pick your site, "Add new week", set a `week_date`, enter a position (1–100) for a keyword×country, leave others blank, save. Expected: the grid shows the position with the right color; "NEW" movement on the first week. Add a second week with a changed position → movement arrow appears. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: port Ranking view + weekly entry grid"
```

---

## Task 5: Backlinks & QA views

**Files:**
- Create (copy): `src/app/(app)/backlinks/{page.tsx,actions.ts}`, `src/app/(app)/qa/{page.tsx,actions.ts}`, `src/components/sections/{AddBacklink,QaEditor}.tsx`

- [ ] **Step 1: Copy the backlinks + QA pages, actions, and components**

```bash
cp ".reference/trybet/src/app/(app)/backlinks/page.tsx"   "src/app/(app)/backlinks/page.tsx"
cp ".reference/trybet/src/app/(app)/backlinks/actions.ts" "src/app/(app)/backlinks/actions.ts"
cp ".reference/trybet/src/app/(app)/qa/page.tsx"          "src/app/(app)/qa/page.tsx"
cp ".reference/trybet/src/app/(app)/qa/actions.ts"        "src/app/(app)/qa/actions.ts"
cp .reference/trybet/src/components/sections/AddBacklink.tsx src/components/sections/AddBacklink.tsx
cp .reference/trybet/src/components/sections/QaEditor.tsx    src/components/sections/QaEditor.tsx
```

- [ ] **Step 2: Typecheck + build**

```bash
npx tsc --noEmit && npm run build
```
Expected: `/backlinks` and `/qa` build, no type errors.

- [ ] **Step 3: Manual check**

```bash
npm run dev
```
As admin on `/backlinks`: add a backlink row → appears. On `/qa`: the QA grid needs QA pages + QA elements; add at least one QA page (Manage → QA Pages) and seed QA elements if empty (Manage → QA Elements: e.g. Text, Buttons, Images), then toggle a check pass/fail → it persists with a "last checked" timestamp. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: port Backlinks + QA views"
```

---

## Task 6: Analytics placeholder (net-new, inert)

**Files:**
- Create: `src/app/(app)/analytics/page.tsx`
- Modify: `src/lib/nav.ts`, `src/components/TopNav.test.tsx`

- [ ] **Step 1: Add the Analytics tab to the nav (before Manage)**

In `src/lib/nav.ts`, insert into `NAV_ITEMS` immediately before the `Manage` entry:
```ts
  { label: "Analytics", href: "/analytics" },
```
Resulting order: Overview, SEO, Health, PageSpeed, Ranking, Backlinks, QA, Analytics, Manage.

- [ ] **Step 2: Add a failing nav assertion**

In `src/components/TopNav.test.tsx`, add `"Analytics"` to the list of labels the first test asserts are rendered (the test that loops over expected tab labels). Run:
```bash
npx vitest run src/components/TopNav.test.tsx
```
Expected: FAIL on the new `Analytics` link assertion (the tab is in nav but no link yet renders only if nav drives it — if the test already passes because TopNav maps `NAV_ITEMS`, that's fine: it confirms the tab renders). If it passes immediately, that is acceptable — the nav is data-driven.

- [ ] **Step 3: Create the inert Analytics page**

Create `src/app/(app)/analytics/page.tsx`:
```tsx
export default function AnalyticsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Analytics</h1>
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="text-sm font-medium text-slate-700">Comparison analytics — not configured yet</p>
        <p className="mt-1 text-sm text-slate-500">
          This section is reserved for the comparison view. Its structure will be supplied later;
          until then it intentionally shows no data.
        </p>
      </div>
    </div>
  );
}
```
No DB tables, no queries, no actions — fully inert by design (per spec §4).

- [ ] **Step 4: Test + build**

```bash
npx vitest run src/components/TopNav.test.tsx
npm run build
```
Expected: nav test passes (Analytics tab present); `/analytics` route builds and renders the placeholder.

- [ ] **Step 5: Manual check (both roles)**

```bash
npm run dev
```
As admin and again as viewer: the Analytics tab appears for both; the page shows the "not configured yet" card. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add inert Analytics placeholder section + nav tab"
```

---

## Self-Review (completed during planning)

- **Spec coverage (Phase 3 scope):** Overview ✓ (Task 2); SEO/Health/PageSpeed + entry + screenshots ✓ (Task 3); Ranking weekly + entry ✓ (Task 4); Backlinks + QA ✓ (Task 5); Recharts trends + StatCard + site selector ✓ (Task 1 components used across pages); inline admin-only editing ✓ (actions are `requireAdmin`-gated, ported); Analytics inert placeholder ✓ (Task 6).
- **Brand check:** none of the ported section files contain brand literals (grep-confirmed); no de-branding needed in this phase.
- **Dependency note:** Task 3 Step 3 / Task 4–5 instruct copying any missed imported component from the matching reference path — covers the few cross-imports without enumerating every leaf.
- **Placeholder scan:** the only "placeholder" is the Analytics page, which is intentional and fully specified; no vague steps.
- **Type consistency:** RPC names (`dashboard_overview`, `rankings_top10_trend`, `ranking_weeks`, `ranking_grid`) match migrations 0006/0007; `rank-cell` movement/color helper matches the Ranking view's import; `NAV_ITEMS` shape unchanged (label/href/adminOnly).

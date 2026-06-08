# Optinet SEO/QA Dashboard — Implementation Plan Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each phase plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`../specs/2026-06-08-optinet-seo-dashboard-design.md`](../specs/2026-06-08-optinet-seo-dashboard-design.md)

**Goal:** Build a reusable, de-branded SEO/QA client-reporting dashboard (Next.js 16 + Supabase + Recharts) that ports the structure of `TryBet-Dashboard`, runs fully local on Docker, adds a `MetricSource` automation seam with PageSpeed Insights wired live, an inert Analytics placeholder, and a tokenless `InsightProvider` assistant.

**Architecture:** Phases 1–3 **port** the reference repo (clone → copy files → de-brand → verify against the reference's own tests). Phases 4–5 are **new** TDD builds. Phase 6 is end-to-end verification. The reference is cloned into `./.reference/trybet/` (gitignored) in Phase 1 Task 0 so every later phase can rely on it.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind 4, `@supabase/ssr` + `@supabase/supabase-js`, Supabase CLI (local, via `npx supabase`, Docker), Recharts, Vitest + React Testing Library.

---

## Reference repo

The original is private: `optinet-solutions-sandbx/TryBet-Dashboard`. Phase 1 clones it to `./.reference/trybet/`. If the clone path is missing at the start of any phase, re-run:

```bash
git clone --depth 1 https://github.com/optinet-solutions-sandbx/TryBet-Dashboard.git .reference/trybet
```

Treat `.reference/trybet/` as **read-only**. Never edit it; copy out of it.

## De-branding contract (applies to every port phase)

All brand-specific strings funnel through one file, `src/config/brand.ts`:

```ts
export const BRAND = {
  name: "Client",                       // shown in the top-nav and login
  productName: "SEO/QA Dashboard",      // shown in <title>
} as const;
```

The reference's brand literals to replace when a ported file contains them (full list confirmed by grep):

| Reference file | Literal | Replace with |
|---|---|---|
| `src/app/layout.tsx` | `"Trybet Dashboard"` / `"SEO/QA tracking for Trybet"` | `` `${BRAND.name} — ${BRAND.productName}` `` / generic description |
| `src/app/login/page.tsx` | `"Trybet Dashboard"` | `` `${BRAND.name} Dashboard` `` |
| `src/components/TopNav.tsx` | `"Trybet"` | `{BRAND.name}` |
| `src/components/TopNav.test.tsx` | `"Trybet"` | `BRAND.name` (import it) |
| `package.json` | `"trybet-dashboard"` | `"optinet-seo-dashboard"` |
| `src/lib/manage/build-row.test.ts` | `trybet.io` fixtures | leave as-is (test fixtures, brand-agnostic) |

**Dropped entirely (not ported):** everything under `scripts/import/`, plus `scripts/migrate.mjs` (replaced by the Supabase CLI's `db reset`) — they exist only for the one-time Excel import and hosted-DB migration, which the template does not have. (`verify-schema.mjs` IS ported, adapted for local, in Phase 2.) The `references/Trybet.xlsx` data file is never copied.

**Simplified vs. spec §8:** the optional `scripts/init-client.mjs` is intentionally **not** built. Its two jobs — reset the DB and stamp the brand — are already covered by `npx supabase db reset` and editing `src/config/brand.ts`. Phase 6 Task 4 verifies the one-file re-skin. Add the script later only if a one-command bootstrap is wanted.

## Phases

| # | Plan | Type | Produces |
|---|---|---|---|
| 1 | [`2026-06-08-phase1-scaffold.md`](2026-06-08-phase1-scaffold.md) | Port | Next 16 app, test harness, Supabase clients, de-branded top-nav shell, local Supabase running on Docker |
| 2 | [`2026-06-08-phase2-schema-security-manage.md`](2026-06-08-phase2-schema-security-manage.md) | Port | All tables, `is_admin()`, RLS, Storage bucket+policies, profiles trigger, auth (login/logout), Manage CRUD screens, local account provisioning |
| 3 | [`2026-06-08-phase3-section-views.md`](2026-06-08-phase3-section-views.md) | Port | Overview + SEO/Health/PageSpeed/Ranking/Backlinks/QA views, inline admin data entry, Recharts trends, site selector, inert Analytics placeholder |
| 4 | [`2026-06-08-phase4-automation-psi.md`](2026-06-08-phase4-automation-psi.md) | New (TDD) | `MetricSource` seam, live PageSpeed Insights auto-fill, weekly-ranking cron seam, `docs/automation-roadmap.md` |
| 5 | [`2026-06-08-phase5-assistant.md`](2026-06-08-phase5-assistant.md) | New (TDD) | Tokenless `InsightProvider` + `RuleProvider`, canned-question panel, LLM-ready seam |
| 6 | [`2026-06-08-phase6-verify-ship.md`](2026-06-08-phase6-verify-ship.md) | Verify | Full browser verification (both roles), PSI live check, optional first hosted deploy |

**Ordering is strict 1→6** (each phase depends on the prior). Within a phase, tasks are ordered.

## Definition of done (whole project)

- `npm test` green; `npx tsc --noEmit` clean; `npm run build` succeeds.
- `npx supabase start` brings up local Postgres/Auth/Storage; `npx supabase db reset` applies all migrations; `npm run accounts:provision` creates a local admin + viewer.
- Admin can log in and edit every section inline; viewer logs in and is read-only (blocked at the DB, verified by an attempted write).
- PageSpeed "Auto-fill from PSI" writes a real `pagespeed_entries` row for a configured URL.
- Assistant panel answers each canned question from live data with no network/LLM calls.
- Analytics route renders its placeholder; nothing else references it.
- `src/config/brand.ts` is the only file edited to re-skin for a new client.

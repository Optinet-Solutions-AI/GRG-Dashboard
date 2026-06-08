# Optinet SEO/QA Dashboard — Design Spec (Reusable Agency Template)

**Date:** 2026-06-08
**Status:** Approved design, pending implementation plan
**Author:** John (Optinet Solutions) + Claude (brainstorming session)
**Reference:** `optinet-solutions-sandbx/TryBet-Dashboard` (single-brand original) — this spec
de-brands it into a reusable, clonable template and adds automation, an Analytics
placeholder, and a tokenless Assistant.

## 1. Purpose

Build a **reusable SEO/QA client-reporting dashboard template**. It is a faithful
structural copy of TryBet-Dashboard with TryBet's data and one-time Excel-import baggage
removed, so the agency can stand up a new client dashboard by editing one config file and
seeding sites — no developer rework per client. One brand per deployment. The admin
(agency) maintains data; one client logs in **read-only**, enforced at the database via
Row-Level Security.

### Goals
- A clean, clonable starter that reproduces the reference's structure, look, and security.
- Self-service management of building blocks (sites, keywords, countries, etc.).
- Trends over time for week-to-week / dated metrics; **weekly ranking** retained.
- An **automation seam** so manual entry can be progressively replaced by API data —
  with **PageSpeed Insights wired live** as the proof, and everything else documented.
- A **tokenless Assistant** answering bounded performance questions over dashboard data.
- An inert **Analytics (comparison)** placeholder, structure to be supplied later.
- Local-first development on Docker; promote to hosted production by swapping env vars.

### Non-goals (YAGNI)
- No public sign-ups; invite-only (admin + viewer per deployment).
- No multi-tenant / multi-brand in a single deployment — one brand per clone.
- No paid-API automation wired in this build (Ahrefs/DataForSEO/GA4/GSC) — documented as
  a roadmap with seams ready, not implemented.
- No Excel-import migration path (TryBet's one-time concern; template starts empty).
- No free-form LLM Q&A in this build — only a seam for it.

## 2. Stack

- **Next.js 16 (App Router) + TypeScript + Tailwind 4**, deployable on **Vercel**.
- **Supabase**: Postgres + Auth + Row-Level Security + Storage.
- Mutations via **Next.js Server Actions**. Charts via **Recharts**.
- **Local dev:** full Supabase stack in **Docker** via `npx supabase` (Postgres + Auth +
  RLS + Storage with parity to production). **Production:** hosted Supabase project +
  Vercel; the only change is environment variables.

> **Next.js version note:** Next.js 16+ differs from older training data (e.g. middleware
> is now `proxy.ts`). Read the relevant guide in `node_modules/next/dist/docs/` before
> writing framework code. (Carried from the reference's `AGENTS.md`.)

## 3. Look & feel (carried from reference)

Dark **top horizontal nav** (not a sidebar). Brand name + **site selector dropdown**
("All sites ▾") top-left; admin email top-right. Light gray content background; **white
stat cards** (uppercase gray label, big bold number, small movement note); green Recharts
line/area charts. Score chips color-coded (green ≥90 / amber ≥70 / red below; ranking:
green = top 10, amber = 11–100, red = not in top 100).

**Section page pattern:** *current-values table → trend chart (history) → inline add/edit
(admin only)*. Health & PageSpeed show the uploaded screenshot beside typed numbers. The
site selector filters the whole dashboard. The viewer sees identical pages, read-only.

## 4. Sections (top nav)

Carried 1:1 from the reference: **Overview · SEO · Health · PageSpeed · Ranking ·
Backlinks · QA · Manage** (admin only).

**New — Analytics:** a placeholder "comparison" section. Scaffold the nav item, a page
shell rendering a "configure later" empty state, and a reserved (empty) data slot. No
tables, no logic until the structure is supplied. Inert by design.

**New — Assistant:** tokenless insights (see §7). Surfaced as a panel (and/or nav item).

## 5. Data model (replicated from reference)

Purpose-built tables per area (not one generic `measurements` table — rejected
alternative; the typed, per-area approach yields cleaner RPCs and simpler RLS). Time-series
stored **"tidy"** (one row per measurement). Because Supabase caps queries at **1000 rows**,
all lists/aggregates use **scoped queries or Postgres RPCs** — never fetch a whole table
and filter in JS.

### 5.1 Settings tables (admin-managed, self-service)
- **sites** — `id, domain, display_name, sort_order, active, created_at`
- **keywords** — `id, text, global_volume, sort_order, active`
- **countries** — `id, code, name, sort_order, active`
- **pagespeed_urls** — `id, site_id, url, label, sort_order, active`
- **qa_pages** — `id, site_id, url, label, sort_order, active`
- **qa_elements** — `id, name, sort_order`
- **profiles** — `id (= auth.users.id), email, role ('admin' | 'viewer')`

### 5.2 Data tables
- **seo_scores** — `id, site_id, date, rankmath_analyzer (0–100), seo_homepage (0–100),
  health_score (0–100)`
- **health_snapshots** — `id, site_id, date, domain_rating, referring_domains,
  total_visitors, organic_traffic, organic_keywords, screenshot_path`
- **pagespeed_entries** — `id, pagespeed_url_id, date, mobile_score, desktop_score,
  mobile_screenshot_path, desktop_screenshot_path`
- **rankings** — `id, week_date, site_id, country_id, keyword_id, position (int, nullable)`
  — one row per week × site × country × keyword; movement & color **computed** vs. prior
  week, not stored. `position` null = "not in top 100."
- **keyword_volumes** — `id, keyword_id, country_id, volume` (latest per keyword × country).
- **backlinks** — `id, site_id, date, source_site, source_url, anchor_text, target_url`
- **qa_checks** — `id, qa_page_id, qa_element_id, passed (bool), last_checked_at`
  (latest-only; one row per page × element)

**No seed data.** The template ships an empty DB; the agency populates via Manage.

### 5.3 Ranking conventions (retained)
Lower position = better. Movement vs. previous week: ▲ improved, ▼ dropped, "NEW" (no prior
week), "no change"; blank/null current = "not in top 100." **Weekly ranking is retained**
and gets an automation cron seam (§6) so "update each week" can flip manual → automatic.

## 6. Automation: seam + one live win

The reference forbade automation; this template inverts that **additively** via a
data-source adapter layer at `src/lib/sources/`.

- **`MetricSource` interface** — a small contract, e.g. `fetch(input) → rows[]`, that an
  adapter implements to produce rows for a section. Manual entry remains the default and
  always works; an adapter merely **pre-fills** what a human would otherwise type.
- **Live now — PageSpeed Insights** (`src/lib/sources/pagespeed-insights.ts`): free, no
  auth required (an API key is optional for higher quota). A Server Action calls PSI v5 for
  a site URL and upserts mobile/desktop scores into `pagespeed_entries`. This proves the
  end-to-end pattern (config → adapter → action → table → UI).
- **Roadmap, not wired** — delivered as `docs/automation-roadmap.md`:

| Section | Auto source | Cost | Auth | Status |
|---|---|---|---|---|
| PageSpeed | PSI API v5 | Free | none / optional key | **Live in this build** |
| Ranking (weekly) | DataForSEO SERP, or GSC for own verified sites | Paid / Free | API key / OAuth | Roadmap + cron seam |
| Health (DR, ref domains, traffic, keywords) | Ahrefs / DataForSEO | Paid | API key | Roadmap |
| SEO Score (Rankmath /100) | Rankmath REST (WordPress only) | Free | site creds | Roadmap |
| Backlinks | DataForSEO / Moz / Common Crawl | Free-limited / Paid | API key | Roadmap |
| Analytics (comparison) | GA4 Data API | Free | OAuth | Pending structure |
| QA checklist | Playwright automated checks | Free | none | Roadmap (partial) |

- **Weekly-ranking cron seam:** a documented hook (Vercel Cron or a scheduled Supabase
  function) that would call the ranking source on a weekly cadence — stubbed, not active,
  so it can be switched on later without rework.

## 7. Tokenless Assistant

A deterministic insights engine behind an **`InsightProvider`** interface. The shipped
**`RuleProvider`** answers a fixed catalog of bounded questions by running RPCs against
dashboard data — **zero LLM tokens, zero API cost**:

- "Which site improved most this week?" (ranking deltas)
- "What's missing or stale?" (sections with no recent entry / blanks)
- "Is PageSpeed up or down vs. the last period?"
- "Top ranking movers" / "Health summary"

UI: a small panel with canned-question chips → templated natural-language answer. The
`InsightProvider` seam lets a future **`LlmProvider`** (e.g. Claude) be dropped in for
free-form Q&A without touching the UI or query layer. Not built in this phase.

## 8. Reusability layer (the "template" part)

- **`src/config/brand.ts`** — brand display name, accent color, logo path, default locale.
  TopNav and `<title>` read from this. Cloning a client for a new deployment = edit this
  file (+ seed sites in Manage + point env vars at that client's Supabase project).
- **`.env.local.example`** — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (server-only). Local vs. prod differ only by these values.
- **`scripts/init-client.mjs`** (thin) — reset the local DB to a clean state and stamp
  brand config. Deliberately minimal: no scraping, no seed beyond what Manage provides.

## 9. Auth, RLS & Storage security (carried from reference)

- Supabase Auth, **email + password**, **sign-ups disabled** (invite-only). Two accounts
  per deployment: **admin** (agency) + **viewer** (client), provisioned via admin API; a
  trigger creates a `profiles` row defaulting to `viewer`; admin promoted explicitly.
- **RLS enforced at the DB:** SELECT for any authenticated user; INSERT/UPDATE/DELETE
  admins only via an `is_admin()` SQL function reading the caller's role from `profiles`.
- All mutations go through **Server Actions** that re-check admin (defense in depth).
- **Storage:** one `screenshots` bucket (`health/`, `pagespeed/` folders). Read = any
  authenticated user; upload/replace/delete = admins only, via Server Action.
- **Service-role key is server-side only** — never shipped to the browser.

## 10. Testing strategy

TDD on the risky pure logic — tests before implementation:
- PSI adapter response parser (extract mobile/desktop scores; handle missing/throttled).
- Ranking movement/color computation (▲/▼/NEW/no-change; null handling).
- Assistant `RuleProvider` handlers (each canned question → expected templated answer).

Plus: Server Action admin-guard tests; final browser verification (admin can log in and
edit; viewer is read-only; screenshots render; PSI auto-fill writes a real entry; Analytics
shows its placeholder state).

## 11. Deployment (lessons carried from reference)

- Set env vars in the Vercel dashboard, **not** piped through PowerShell (PowerShell injects
  a BOM that breaks the Supabase key). Env-var changes require a fresh build, not just a
  redeploy.
- **Disable Vercel Deployment Protection** so the production URL is publicly reachable by
  the client (otherwise anonymous 401).
- Co-locate Vercel functions with Supabase via `vercel.json` `regions` when chosen.
- Supabase: disable open sign-ups; provision admin + viewer; set Storage bucket policies.
- Verify live as both admin and viewer before declaring done.

## 12. Build phases (writing-plans will detail)

1. **Scaffold** — Next 16 + Supabase clients + auth/RLS skeleton + de-branded top-nav shell
   + `config/brand.ts`; local Docker Supabase running (`npx supabase start`); minimal build
   proves the pipeline.
2. **Schema + security** — all tables, `is_admin()`, RLS policies, Storage bucket +
   policies, `profiles` trigger; Manage (settings) screens for the entity types.
3. **Section views** — SEO, Health, PageSpeed, Ranking, Backlinks, QA + Overview + inline
   editing + Recharts trends + site selector; Analytics placeholder.
4. **Automation seam + PSI live** — `MetricSource` interface, PSI adapter (TDD), Server
   Action; `docs/automation-roadmap.md`; weekly-ranking cron seam (stub).
5. **Assistant** — `InsightProvider` + `RuleProvider` (TDD) + canned-question panel + LLM
   seam.
6. **Verify & ship** — browser checks both roles; optional first hosted deploy.

## 13. Open items (resolved at deploy)

- Admin email + viewer email per client deployment (passwords set securely, not in chat).
- Hosted Supabase project + Vercel account + region (when promoting to production).
- Optional PSI API key (PSI works keyless at low volume; a key raises quota).
- Analytics section structure (user to supply; section stays inert until then).
- Whether to expose the Assistant as its own nav tab vs. a panel on Overview (decide in
  the plan; default: panel on Overview).

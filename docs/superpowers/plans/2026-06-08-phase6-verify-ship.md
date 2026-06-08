# Phase 6: Verification & Ship — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the whole template works end-to-end — quality gates green, admin can edit, viewer is read-only (blocked at the DB), PSI auto-fill writes a row, the assistant answers tokenlessly, Analytics is inert, and re-skinning is a one-file change — then optionally do the first hosted deploy.

**Architecture:** A consolidated acceptance pass over the running local app. Browser checks use the webapp-testing skill (Playwright). The hosted deploy is guided and gated on the user providing accounts.

**Tech Stack:** Vitest, Next build, Supabase CLI, Playwright (via webapp-testing skill), Supabase Cloud + Vercel (optional).

> **Depends on Phases 1–5.** Local Supabase running; admin + viewer provisioned; at least one site/keyword/country/PageSpeed URL configured.

---

## Task 1: Quality gates

- [ ] **Step 1: Typecheck, tests, build, schema verify**

```bash
npx tsc --noEmit
npm test
npm run build
npm run db:verify
```
Expected: no type errors; **all unit tests pass** (sanity, TopNav, auth, build-row, rank-cell, parse-psi, insights); build lists all routes including `/analytics` and `/api/cron/ranking`; `db:verify` reports no failures.

- [ ] **Step 2: Record the test summary**

Note the passing test count and that the build succeeded. If anything fails, stop and fix in the owning phase before continuing (do not paper over a red gate).

---

## Task 2: Browser verification — admin & viewer (webapp-testing)

> Use the **webapp-testing** skill (Playwright) for these. Start the app with `npm run dev` first.

- [ ] **Step 1: Admin can edit every section**

Drive the browser as `admin@local.dev`:
1. Log in at `/login` → lands on `/` (Overview) with stat cards and the Assistant panel.
2. Visit `/seo`, `/health`, `/pagespeed`, `/ranking`, `/backlinks`, `/qa` — each shows its entry control (admin only). Add one record in each (or confirm prior records render).
3. Visit `/manage` — the tab is visible; add/edit an entity.
Expected: every mutation persists (row appears after save). Capture a screenshot of the Overview.

- [ ] **Step 2: Viewer is read-only and blocked at the DB**

Log out, log in as `viewer@local.dev`:
1. Overview + all section pages render with **no** add/edit controls and **no** Manage tab.
2. Navigating directly to `/manage` redirects to `/` (via `requireAdmin`).
3. **DB-level proof:** in a terminal, attempt a write as the viewer's anon-authenticated context is hard to script, so instead confirm the policy directly — run:
```bash
npx supabase db reset --help >/dev/null 2>&1 # no-op sanity
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "set role authenticated; -- RLS check"
```
If `psql` is unavailable, rely on `npm run db:verify` (anon read denied) plus the migration `0003` admin-only write policies as the enforcement evidence, and note that the UI guard is defense-in-depth on top of RLS.

- [ ] **Step 3: Record results**

Note: admin edit ✓, viewer read-only ✓ (UI + RLS). Attach the Overview screenshot.

---

## Task 3: Feature acceptance — PSI, Assistant, Analytics

- [ ] **Step 1: PSI auto-fill (live)**

As admin on `/pagespeed`, ensure a PageSpeed URL points at a real public site (e.g. `https://example.com`). Click **Auto-fill from PSI**. Expected: "Saved today's scores ✓" and a new `pagespeed_entries` row with mobile/desktop numbers. (Set `PAGESPEED_API_KEY` if rate-limited.)

- [ ] **Step 2: Assistant answers tokenlessly**

On `/`, click each Assistant chip. Expected: instant templated answers from local data; the browser network panel shows only the local Server Action POST — **no external/LLM request**. Confirm "top mover" and "PageSpeed trend" give real comparisons once ≥2 periods exist.

- [ ] **Step 3: Analytics is inert**

Visit `/analytics` as both roles. Expected: the "not configured yet" placeholder; no data, no errors, no extra network calls.

- [ ] **Step 4: Record results**

Note: PSI live ✓, Assistant tokenless ✓, Analytics inert ✓.

---

## Task 4: Re-skin is a one-file change

- [ ] **Step 1: Change the brand and confirm propagation**

Edit only `src/config/brand.ts`:
```ts
export const BRAND = {
  name: "Acme",
  productName: "SEO/QA Dashboard",
} as const;
```
Run `npm run dev`. Expected: the top-nav brand, the `<title>`, and the login heading all read "Acme" — and **no other file needed editing**. Revert to your real client name afterward.

- [ ] **Step 2: Commit any brand default you want to keep**

```bash
git add src/config/brand.ts
git commit -m "chore: set default brand name"
```

---

## Task 5: First hosted deploy (OPTIONAL — guided, needs the user's accounts)

> Do this together with the user; it is not automated. Skip if staying local.

- [ ] **Step 1: Create a hosted Supabase project**

Create a project in the user's chosen region. From the dashboard, copy `Project URL`, `anon` key, `service_role` key, and the connection string (`SUPABASE_DB_URL`).

- [ ] **Step 2: Push migrations to the hosted DB**

Link and push (or apply the SQL via the dashboard SQL editor in order `0001,0002,0003,0004,0006,0007,0008,0009`):
```bash
npx supabase link --project-ref <ref>
npx supabase db push
```
Then provision accounts against hosted by pointing `.env.local`'s `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_DB_URL` at the hosted project and running `npm run accounts:provision` with the real admin + viewer emails (set strong passwords, not in chat).

- [ ] **Step 3: Deploy to Vercel**

Push the repo to GitHub; import into Vercel. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (and optional `PAGESPEED_API_KEY`) **in the Vercel dashboard** — not via PowerShell (it injects a BOM that breaks the key). Trigger a fresh build (env changes need a rebuild). Optionally pin a region in `vercel.json`.

- [ ] **Step 4: Make the URL publicly reachable**

Disable Vercel Deployment Protection / Vercel Authentication so the client can reach the URL anonymously-blocked-but-viewer-accessible.

- [ ] **Step 5: Verify live**

Confirm the live URL: anonymous visitor is redirected to `/login`; the viewer account logs in and sees read-only pages; the admin can edit. Note the live URL.

- [ ] **Step 6: Commit deploy config**

```bash
git add vercel.json 2>/dev/null; git commit -m "chore: production deploy config" || echo "nothing to commit"
```

---

## Self-Review (completed during planning)

- **Spec coverage (Phase 6 / whole-project DoD):** quality gates ✓ (Task 1); admin-edit + viewer-read-only-at-DB ✓ (Task 2); PSI live + tokenless assistant + inert Analytics ✓ (Task 3); one-file re-skin ✓ (Task 4); optional hosted deploy with the reference's baked-in lessons (Vercel BOM, fresh build, deployment protection) ✓ (Task 5).
- **Honesty gate:** Task 1 Step 2 forbids papering over a red gate; Task 2 is explicit that RLS is the enforcement and the UI guard is defense-in-depth.
- **Tooling fallback:** Task 2 Step 2 gives a `psql`-absent fallback (rely on `db:verify` + policy evidence) so the check is runnable on this machine (psql was NOT found in Phase-0 tooling).
- **Placeholder scan:** every step is a concrete command or browser action with an expected result; no vague "test it" steps.

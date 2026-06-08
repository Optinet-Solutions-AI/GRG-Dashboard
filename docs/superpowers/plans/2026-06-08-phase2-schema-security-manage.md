# Phase 2: Schema, Security, Auth & Manage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the full database schema + RLS + Storage + RPCs to the local Supabase stack, port the auth flow (login/logout + auth-guarded `(app)` layout), provision a local admin + viewer, and build the Manage CRUD screens.

**Architecture:** Port the reference's migrations, auth, and Manage code. Migrations are applied with the Supabase CLI (`npx supabase db reset`) instead of the reference's custom runner — so the runner-only migration `0005` is skipped. Account provisioning is adapted to point at the local DB without SSL.

**Tech Stack:** Supabase CLI (local Postgres/Auth/Storage), `@supabase/supabase-js` admin API, `pg`, Next.js Server Actions, Vitest.

> **Depends on Phase 1.** `.reference/trybet/` must exist; local Supabase must start (`npx supabase start`); `.env.local` must hold the local URL + anon + service-role keys.

---

## File Structure (this phase)

- `supabase/migrations/0001..0009*.sql` — ported (**0005 skipped**)
- `scripts/provision-accounts.mjs` — ported + adapted for local (no SSL)
- `scripts/verify-schema.mjs` — ported + adapted for local (verification helper)
- `src/lib/auth.ts` (+ `auth.test.ts`) — ported verbatim
- `src/app/login/page.tsx` (+ `actions.ts`) — ported + de-branded
- `src/app/auth/actions.ts` — `signOut` (ported)
- `src/app/(app)/layout.tsx` — replaced with the auth-guarded reference version
- `src/lib/manage/entities.ts`, `build-row.ts` (+ `build-row.test.ts`), `actions.ts` — ported
- `src/components/manage/EntityForm.tsx`, `EntityTable.tsx` — ported
- `src/app/(app)/manage/{page.tsx,layout.tsx,[entity]/page.tsx}` — ported
- `package.json` — add `accounts:provision`, `db:verify` scripts; add `pg` dev dep

---

## Task 1: Apply schema, RLS, Storage & RPCs locally

**Files:**
- Create (copy): `supabase/migrations/0001_settings.sql`, `0002_data.sql`, `0003_security.sql`, `0004_storage.sql`, `0006_overview_rpcs.sql`, `0007_ranking_rpcs.sql`, `0008_backlink_summary.sql`, `0009_backlink_summary_period.sql`

- [ ] **Step 1: Copy migrations from the reference — but NOT 0005**

```bash
cp .reference/trybet/supabase/migrations/0001_settings.sql            supabase/migrations/
cp .reference/trybet/supabase/migrations/0002_data.sql                supabase/migrations/
cp .reference/trybet/supabase/migrations/0003_security.sql            supabase/migrations/
cp .reference/trybet/supabase/migrations/0004_storage.sql             supabase/migrations/
cp .reference/trybet/supabase/migrations/0006_overview_rpcs.sql       supabase/migrations/
cp .reference/trybet/supabase/migrations/0007_ranking_rpcs.sql        supabase/migrations/
cp .reference/trybet/supabase/migrations/0008_backlink_summary.sql    supabase/migrations/
cp .reference/trybet/supabase/migrations/0009_backlink_summary_period.sql supabase/migrations/
```
**Do not copy `0005_lock_schema_migrations.sql`** — it runs `alter table public.schema_migrations ...`, a table created only by the reference's custom migration runner. Under the Supabase CLI, `public.schema_migrations` does not exist and that migration would error. The CLI tracks migrations in its own locked-down `supabase_migrations` schema.

- [ ] **Step 2: (Optional) generalize the hardcoded backfill date in 0009**

`0009_backlink_summary_period.sql` adds `period_date date not null default '2026-06-05'`. This default only affects rows that existed before the column was added; on a fresh template DB there are none, so it is harmless. Leave as-is.

- [ ] **Step 3: Apply all migrations to the local DB**

```bash
npx supabase db reset
```
Expected: the CLI drops + recreates the local DB and applies `0001,0002,0003,0004,0006,0007,0008,0009` in order with no errors. If `0003`/`0004` error on `auth.users` or `storage.objects`, confirm the local stack is running (`npx supabase status`).

- [ ] **Step 4: Port + adapt the schema verification script for local**

```bash
mkdir -p scripts
cp .reference/trybet/scripts/verify-schema.mjs scripts/verify-schema.mjs
```
Edit `scripts/verify-schema.mjs`: the `pg.Client` is constructed with `ssl: { rejectUnauthorized: false }`. Local Postgres has no SSL — make SSL conditional:
```js
const isLocal = /localhost|127\.0\.0\.1/.test(dbUrl);
const client = new pg.Client({ connectionString: dbUrl, ssl: isLocal ? false : { rejectUnauthorized: false } });
```

- [ ] **Step 5: Add the `db:verify` script + install `pg`**

```bash
npm install -D pg @types/pg
```
In `package.json` `"scripts"` add:
```json
"db:verify": "node --env-file=.env.local scripts/verify-schema.mjs"
```
Add to `.env.local` the local DB URL (used only by Node scripts, not the browser):
```
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

- [ ] **Step 6: Run verification**

```bash
npm run db:verify
```
Expected: prints no failures — all 14 expected tables present, RLS enabled on each, `is_admin()` present, and the anonymous PostgREST read of `sites` returns no rows (RLS denies anon).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations scripts/verify-schema.mjs package.json
git commit -m "feat: apply schema, RLS, storage, RPCs to local Supabase"
```

---

## Task 2: Auth flow (login/logout + guarded `(app)` layout)

**Files:**
- Create (copy): `src/lib/auth.ts`, `src/lib/auth.test.ts`, `src/app/login/page.tsx`, `src/app/login/actions.ts`, `src/app/auth/actions.ts`
- Modify (replace): `src/app/(app)/layout.tsx`

- [ ] **Step 1: Port the auth library + its test**

```bash
cp .reference/trybet/src/lib/auth.ts src/lib/auth.ts
cp .reference/trybet/src/lib/auth.test.ts src/lib/auth.test.ts
```
This provides `getCurrentUser`, `getCurrentRole`, `isAdminRole`, `requireUser`, `requireAdmin`.

- [ ] **Step 2: Port login + logout actions and the login page**

```bash
mkdir -p src/app/login src/app/auth
cp .reference/trybet/src/app/login/page.tsx    src/app/login/page.tsx
cp .reference/trybet/src/app/login/actions.ts  src/app/login/actions.ts
cp .reference/trybet/src/app/auth/actions.ts   src/app/auth/actions.ts
```

- [ ] **Step 3: De-brand the login page**

In `src/app/login/page.tsx` add `import { BRAND } from "@/config/brand";` and replace the `<h1>Trybet Dashboard</h1>` text with `<h1 ...>{`${BRAND.name} Dashboard`}</h1>` (use a template literal in JSX braces, or `{BRAND.name} Dashboard`).

- [ ] **Step 4: Replace the `(app)` layout with the reference's auth-guarded version**

```bash
cp ".reference/trybet/src/app/(app)/layout.tsx" "src/app/(app)/layout.tsx"
```
This version calls `getCurrentUser()` → `redirect("/login")` if unauthenticated, reads `getCurrentRole()`, queries `sites`, and renders `<TopNav userEmail isAdmin sites />`. It replaces the Phase-1 placeholder layout. No brand strings here.

- [ ] **Step 5: Run the auth test + typecheck**

```bash
npx vitest run src/lib/auth.test.ts
npx tsc --noEmit
```
Expected: PASS; no type errors. (`auth.test.ts` mocks the Supabase server client; it needs no live DB.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: port auth flow + guarded app layout"
```

---

## Task 3: Provision a local admin + viewer

**Files:**
- Create (copy + adapt): `scripts/provision-accounts.mjs`
- Modify: `package.json`, `.env.local`

- [ ] **Step 1: Port the provisioning script**

```bash
cp .reference/trybet/scripts/provision-accounts.mjs scripts/provision-accounts.mjs
```

- [ ] **Step 2: Adapt the `pg.Client` for local (no SSL)**

In `scripts/provision-accounts.mjs`, the `pg.Client` is built with `ssl: { rejectUnauthorized: false }`. Make it conditional on a local DB URL:
```js
const isLocal = /localhost|127\.0\.0\.1/.test(dbUrl);
const client = new pg.Client({ connectionString: dbUrl, ssl: isLocal ? false : { rejectUnauthorized: false } });
```
Leave the rest (`ensureUser`, role promotion) unchanged.

- [ ] **Step 3: Add the npm script + provisioning env vars**

In `package.json` `"scripts"` add:
```json
"accounts:provision": "node --env-file=.env.local scripts/provision-accounts.mjs"
```
Add to `.env.local` (local-only dev creds — pick simple local passwords; never commit):
```
ADMIN_EMAIL=admin@local.dev
ADMIN_PASSWORD=admin-local-pw
VIEWER_EMAIL=viewer@local.dev
VIEWER_PASSWORD=viewer-local-pw
```
(`SUPABASE_DB_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` are already set from Task 1 / Phase 1.)

- [ ] **Step 4: Run provisioning**

```bash
npm run accounts:provision
```
Expected: prints `Profiles: admin@local.dev=admin, viewer@local.dev=viewer` then `Provisioning complete.` (The `handle_new_user` trigger created both as `viewer`; the script promotes the admin.)

- [ ] **Step 5: Manually verify login in the browser**

```bash
npm run dev
```
Visit `/login`, sign in as `admin@local.dev`. Expected: redirect to `/` (Overview shell); the top-nav shows the email and the admin-only Manage tab. Sign out (the account menu posts to `signOut`) → redirected to `/login`. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add scripts/provision-accounts.mjs package.json
git commit -m "feat: local admin/viewer account provisioning"
```

---

## Task 4: Manage CRUD screens

**Files:**
- Create (copy): `src/lib/manage/entities.ts`, `build-row.ts`, `build-row.test.ts`, `actions.ts`; `src/components/manage/EntityForm.tsx`, `EntityTable.tsx`; `src/app/(app)/manage/page.tsx`, `layout.tsx`, `[entity]/page.tsx`

- [ ] **Step 1: Port the manage library + its unit test**

```bash
mkdir -p src/lib/manage
cp .reference/trybet/src/lib/manage/entities.ts     src/lib/manage/entities.ts
cp .reference/trybet/src/lib/manage/build-row.ts    src/lib/manage/build-row.ts
cp .reference/trybet/src/lib/manage/build-row.test.ts src/lib/manage/build-row.test.ts
cp .reference/trybet/src/lib/manage/actions.ts      src/lib/manage/actions.ts
```
`entities.ts` is the registry of the six manageable entity types (sites, keywords, countries, pagespeed-urls, qa-pages, qa-elements). The `trybet.io` strings in `build-row.test.ts` are brand-agnostic fixtures — leave them.

- [ ] **Step 2: Port the manage UI components + pages**

```bash
mkdir -p src/components/manage "src/app/(app)/manage/[entity]"
cp .reference/trybet/src/components/manage/EntityForm.tsx  src/components/manage/EntityForm.tsx
cp .reference/trybet/src/components/manage/EntityTable.tsx src/components/manage/EntityTable.tsx
cp ".reference/trybet/src/app/(app)/manage/page.tsx"        "src/app/(app)/manage/page.tsx"
cp ".reference/trybet/src/app/(app)/manage/layout.tsx"      "src/app/(app)/manage/layout.tsx"
cp ".reference/trybet/src/app/(app)/manage/[entity]/page.tsx" "src/app/(app)/manage/[entity]/page.tsx"
```
This overwrites the Phase-1 placeholder `manage/page.tsx`. The manage `layout.tsx` enforces admin via `requireAdmin()`.

- [ ] **Step 3: Run the build-row test + typecheck + build**

```bash
npx vitest run src/lib/manage/build-row.test.ts
npx tsc --noEmit
npm run build
```
Expected: PASS; no type errors; build succeeds with the dynamic `/manage/[entity]` route listed.

- [ ] **Step 4: Manually verify Manage CRUD as admin**

```bash
npm run dev
```
As `admin@local.dev`, go to **Manage → Sites**, add a site (e.g. domain `example.com`, display name `Example`). Expected: it appears in the table. Add one keyword, one country (e.g. `US` / `United States`), and one PageSpeed URL for the site (needed by Phases 3–4). Stop the dev server.

- [ ] **Step 5: Verify viewer is blocked at the DB**

Sign in as `viewer@local.dev`. Expected: no Manage tab; visiting `/manage` redirects to `/` (via `requireAdmin`). Confirm RLS independently:
```bash
npm run db:verify
```
(Anon read already proven denied in Task 1; the admin-only write policies were applied by `0003`.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: port Manage CRUD screens for the six entity types"
```

---

## Self-Review (completed during planning)

- **Spec coverage (Phase 2 scope):** all tables + tidy time-series ✓ (Task 1); `is_admin()` + RLS read-auth/write-admin ✓ (0003); Storage bucket + policies ✓ (0004); profiles trigger ✓ (0003); Overview/Ranking RPCs ✓ (0006/0007); auth email+password + guarded layout ✓ (Task 2); invite-only admin+viewer provisioning ✓ (Task 3); self-service Manage for six entities ✓ (Task 4).
- **Migration-runner divergence handled:** `0005` skipped with rationale (CLI vs custom runner) — the single most likely port failure, called out explicitly.
- **Local adaptations:** `pg` SSL disabled for localhost in both scripts (Tasks 1 & 3); `SUPABASE_DB_URL` set to the local pooler-less port `54322`.
- **Placeholder scan:** no vague steps; every file is a named copy + concrete edit; expected outputs given.
- **Type consistency:** `requireAdmin`/`getCurrentRole`/`isAdminRole` (auth), `ENTITIES`/`getEntity` (manage), `BRAND.name` (login) match the reference exports and Phase 1.

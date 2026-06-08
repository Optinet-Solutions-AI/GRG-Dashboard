# Phase 1: Scaffold, Tooling, App Shell & Local Supabase — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Next.js 16 + TypeScript + Tailwind app with a Vitest harness, Supabase client wiring, a de-branded top-nav shell, and a running **local Supabase stack on Docker** — committed to git and ready for the schema/auth phase.

**Architecture:** Port the reference's foundation files into a freshly scaffolded Next 16 app, routing all brand strings through `src/config/brand.ts`. Use the Supabase CLI (via `npx`) to run Postgres/Auth/Storage locally in Docker. Tests come from the reference verbatim so parity is verifiable immediately.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind 4, `@supabase/ssr`, `@supabase/supabase-js`, Vitest, @testing-library/react, Supabase CLI (Docker).

> **CRITICAL — Next.js version drift:** Next.js 16 differs from older training data. Before writing/copying framework code (routing, middleware, config), read the relevant guide in `node_modules/next/dist/docs/`. Middleware is `proxy.ts` (not `middleware.ts`). Verify file names/APIs against those local docs, not memory.

> **Prerequisite:** Docker Desktop must be running before Task 5 (`docker version` should succeed). Node ≥ 20 and npm present.

---

## File Structure (this phase)

- `.gitignore` — ignores `node_modules/`, `.next/`, `.env*.local`, `.reference/`, `supabase/.temp/`
- `.reference/trybet/` — read-only clone of the reference (gitignored)
- `src/config/brand.ts` — single source of brand strings
- `package.json` — scripts (de-branded name; import scripts removed)
- `vitest.config.ts`, `vitest.setup.ts` — test harness (ported)
- `.env.local.example` — env template (ported)
- `src/lib/nav.ts` — nav tab list (ported verbatim)
- `src/lib/supabase/client.ts`, `server.ts`, `middleware.ts` — Supabase clients (ported)
- `src/proxy.ts` — Next 16 middleware (ported)
- `src/components/TopNav.tsx` (+ `.test.tsx`) — top nav (ported + de-branded)
- `src/app/layout.tsx`, `globals.css` — root layout (ported + de-branded)
- `src/app/(app)/page.tsx` + section placeholder pages — minimal shells (Phase 3 fills them)
- `supabase/config.toml` — Supabase CLI config (from `supabase init`)

---

## Task 0: Clone the reference and commit the de-branding config

**Files:**
- Create: `.gitignore`, `src/config/brand.ts`

- [ ] **Step 1: Clone the reference into a gitignored path**

Run (from project root `C:\Users\User\Desktop\optinet-seo-dashboard`):
```bash
git clone --depth 1 https://github.com/optinet-solutions-sandbx/TryBet-Dashboard.git .reference/trybet
```
Expected: clone succeeds (cached GitHub credentials are present). Verify: `.reference/trybet/package.json` exists.

- [ ] **Step 2: Create `.gitignore`**

```gitignore
# dependencies
node_modules/
# next.js
.next/
out/
# env
.env
.env*.local
# vercel
.vercel
# read-only reference clone (do not commit)
.reference/
# supabase local
supabase/.temp/
supabase/.branches/
# os / editor
.DS_Store
Thumbs.db
```

- [ ] **Step 3: Create `src/config/brand.ts`**

```ts
export const BRAND = {
  name: "Client",
  productName: "SEO/QA Dashboard",
} as const;
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore src/config/brand.ts
git commit -m "chore: add gitignore and brand config"
```
Expected: commit succeeds; `git status` shows `.reference/` untracked-and-ignored.

---

## Task 1: Scaffold the Next.js app

**Files:** Created by `create-next-app` (`package.json`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`).

- [ ] **Step 1: Run create-next-app into the current directory**

Run:
```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir --eslint --use-npm --turbopack
```
- Accept the default `@/*` import alias when prompted.
- If prompted about a non-empty directory, choose to proceed/keep existing files (`docs/`, `.git`, `.gitignore`, `src/config/`, `.reference/` must be preserved).

- [ ] **Step 2: Pin dependency versions to match the reference**

Open `.reference/trybet/package.json` and align the `next`, `react`, `react-dom`, `eslint-config-next` versions in this project's `package.json` to match (the reference uses `next@16.2.7`, `react@19.2.4`). Then:
```bash
npm install
```

- [ ] **Step 3: Verify it runs**

Run:
```bash
npm run dev
```
Expected: dev server starts on the printed localhost port. Stop with Ctrl-C.

- [ ] **Step 4: Read the local Next.js docs for routing/proxy conventions**

Run:
```bash
ls node_modules/next/dist/docs/
```
Confirm middleware is `proxy.ts`. Do not write it yet.

- [ ] **Step 5: Set the package name and commit**

In `package.json`, set `"name": "optinet-seo-dashboard"`. Then:
```bash
git add -A
git commit -m "chore: scaffold Next.js 16 app (TS, Tailwind, App Router)"
```

---

## Task 2: Test harness (Vitest + RTL) — ported

**Files:**
- Create: `vitest.config.ts`, `vitest.setup.ts`, `src/__mocks__/server-only.ts`, `src/lib/sanity.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Install test dependencies**

Run:
```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Copy the harness files from the reference verbatim**

```bash
cp .reference/trybet/vitest.config.ts vitest.config.ts
cp .reference/trybet/vitest.setup.ts vitest.setup.ts
mkdir -p src/__mocks__ && cp .reference/trybet/src/__mocks__/server-only.ts src/__mocks__/server-only.ts
cp .reference/trybet/src/lib/sanity.test.ts src/lib/sanity.test.ts
```
(On PowerShell use `Copy-Item <src> <dst>`.)

- [ ] **Step 3: Add the test scripts to `package.json`**

In `"scripts"` add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Run the harness**

Run:
```bash
npm test
```
Expected: the sanity test passes. If the `@` alias or jsdom is misconfigured, fix before moving on.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: add Vitest + RTL harness"
```

---

## Task 3: Supabase client wiring — ported

**Files:**
- Create: `.env.local.example`, `src/lib/supabase/client.ts`, `server.ts`, `middleware.ts`, `src/proxy.ts`, `src/lib/supabase/client.test.ts`

- [ ] **Step 1: Install Supabase packages**

```bash
npm install @supabase/supabase-js @supabase/ssr server-only
```

- [ ] **Step 2: Copy the Supabase wiring + env template from the reference**

```bash
cp .reference/trybet/.env.local.example .env.local.example
mkdir -p src/lib/supabase
cp .reference/trybet/src/lib/supabase/client.ts   src/lib/supabase/client.ts
cp .reference/trybet/src/lib/supabase/server.ts   src/lib/supabase/server.ts
cp .reference/trybet/src/lib/supabase/middleware.ts src/lib/supabase/middleware.ts
cp .reference/trybet/src/lib/supabase/client.test.ts src/lib/supabase/client.test.ts
cp .reference/trybet/src/proxy.ts src/proxy.ts
```

- [ ] **Step 3: Verify the cookie/middleware APIs against installed versions**

Open `src/lib/supabase/server.ts` and `src/proxy.ts`. Confirm `cookies()` is awaited and the proxy matcher matches the installed Next 16 docs (`node_modules/next/dist/docs/`). Adjust only if the installed versions differ from the reference.

- [ ] **Step 4: Run the client test + typecheck**

```bash
npx vitest run src/lib/supabase/client.test.ts
npx tsc --noEmit
```
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: port Supabase browser/server clients + proxy"
```

---

## Task 4: De-branded top-nav shell + app skeleton

**Files:**
- Create: `src/lib/nav.ts`, `src/components/TopNav.tsx`, `src/components/TopNav.test.tsx`
- Modify: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`

- [ ] **Step 1: Copy nav + TopNav + global CSS + root layout from the reference**

```bash
cp .reference/trybet/src/lib/nav.ts src/lib/nav.ts
cp .reference/trybet/src/components/TopNav.tsx src/components/TopNav.tsx
cp .reference/trybet/src/components/TopNav.test.tsx src/components/TopNav.test.tsx
cp .reference/trybet/src/app/globals.css src/app/globals.css
cp .reference/trybet/src/app/layout.tsx src/app/layout.tsx
```

- [ ] **Step 2: De-brand `src/components/TopNav.tsx`**

Add at the top:
```tsx
import { BRAND } from "@/config/brand";
```
Replace the hardcoded brand text `Trybet` with `{BRAND.name}`. (Search the file for `Trybet` — there is exactly one occurrence, the brand `<span>`.)

- [ ] **Step 3: De-brand `src/components/TopNav.test.tsx`**

Add `import { BRAND } from "@/config/brand";` and replace the `"Trybet"` string assertion with `BRAND.name`. Keep all other tab/role assertions unchanged.

- [ ] **Step 4: De-brand the root `src/app/layout.tsx`**

The root layout keeps only `<html>/<body>` + font setup + `{children}` (it must NOT render `<TopNav>` — the reference renders the nav inside the `(app)` route-group layout). Add `import { BRAND } from "@/config/brand";` and set:
```tsx
export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.productName}`,
  description: `${BRAND.productName}`,
};
```
If the copied `src/app/layout.tsx` imports/renders `<TopNav>`, remove that import and the `<TopNav>`/`<main>` wrapper from the root layout (they belong to the `(app)` layout created next).

- [ ] **Step 5: Create the Phase-1 `(app)` route-group layout (no auth guard yet)**

Create `src/app/(app)/layout.tsx` — renders the nav + content wrapper with placeholder props. Phase 2 replaces this body with the reference's auth-guarded version.
```tsx
import { TopNav } from "@/components/TopNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopNav userEmail="local@dev" isAdmin={true} sites={[]} />
      <main className="mx-auto max-w-7xl px-5 py-6">{children}</main>
    </>
  );
}
```
> Confirm the `TopNav` prop names/types against `.reference/trybet/src/app/(app)/layout.tsx` and `.reference/trybet/src/components/TopNav.tsx`; match them exactly (the reference passes `userEmail`, `isAdmin`, `sites`).

- [ ] **Step 6: Run the TopNav test**

```bash
npx vitest run src/components/TopNav.test.tsx
```
Expected: PASS (brand + all tabs + site-selector assertions). Use the reference test's exact render invocation/props — it is the source of truth.

- [ ] **Step 7: Create minimal placeholder pages under `(app)` so the app builds**

Create `src/app/(app)/page.tsx` (temporary Overview shell; Phase 3 replaces it):
```tsx
export default function OverviewPage() {
  return <h1 className="text-xl font-bold">Overview</h1>;
}
```
Create one file per section with the same shape, changing the heading:
- `src/app/(app)/seo/page.tsx` → "SEO Score"
- `src/app/(app)/health/page.tsx` → "Health Score"
- `src/app/(app)/pagespeed/page.tsx` → "PageSpeed"
- `src/app/(app)/ranking/page.tsx` → "Ranking"
- `src/app/(app)/backlinks/page.tsx` → "Backlinks"
- `src/app/(app)/qa/page.tsx` → "QA Checklist"
- `src/app/(app)/manage/page.tsx` → "Manage"

Each file:
```tsx
export default function Page() {
  return <h1 className="text-xl font-bold">SECTION_NAME</h1>;
}
```
(Replace `SECTION_NAME`.) Delete the default `src/app/page.tsx` emitted by create-next-app so `/` resolves to the `(app)` Overview.

- [ ] **Step 8: Build + full test suite**

```bash
npm run build
npm test
```
Expected: build lists all routes; tests pass.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: de-branded top-nav shell + placeholder section pages"
```

---

## Task 5: Local Supabase on Docker

**Files:** Created by `supabase init` (`supabase/config.toml`, `supabase/.gitignore`).

- [ ] **Step 1: Confirm Docker is running**

```bash
docker version
```
Expected: both Client and Server versions print. If the Server section errors, start Docker Desktop first.

- [ ] **Step 2: Initialize Supabase locally**

```bash
npx supabase init
```
Accept defaults. This creates `supabase/config.toml`. Keep the `supabase/migrations/` folder (empty for now; Phase 2 adds the SQL).

- [ ] **Step 3: Start the local stack**

```bash
npx supabase start
```
Expected (first run pulls images, a few minutes): prints `API URL` (e.g. `http://127.0.0.1:54321`), `anon key`, and `service_role key`. Record these.

- [ ] **Step 4: Create `.env.local` pointing at local Supabase**

Copy the example and fill from `supabase start` output:
```bash
cp .env.local.example .env.local
```
Set in `.env.local` (these are the local dev keys printed by `supabase start`; safe to keep local, never commit):
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase start>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase start>
```
Confirm `.env.local` is gitignored (`git status` must not list it).

- [ ] **Step 5: Sanity-check the dev app against local Supabase**

```bash
npm run dev
```
Open the printed URL. Expected: the shell renders (nav + Overview heading). No auth/data yet — that's Phase 2. Stop with Ctrl-C.

- [ ] **Step 6: Commit the Supabase config**

```bash
git add supabase/config.toml supabase/.gitignore
git commit -m "chore: init local Supabase (Docker) config"
```

---

## Self-Review (completed during planning)

- **Spec coverage (Phase 1 scope):** scaffold ✓ (Task 1); test harness ✓ (Task 2); Supabase wiring ✓ (Task 3); de-branded top-nav shell + `config/brand.ts` ✓ (Tasks 0, 4); local Supabase on Docker ✓ (Task 5); reference clone for later phases ✓ (Task 0). Auth, schema, RLS, Storage, section data views are deferred to Phases 2–3.
- **Placeholder scan:** no "TBD"/"handle edge cases"; every code step shows real content or an exact copy source.
- **Type consistency:** `BRAND` (`.name`, `.productName`), `NAV_ITEMS`, `createBrowserSupabaseClient`/`createServerSupabaseClient` referenced consistently and match the reference's exports.
- **Soft spots flagged inline:** create-next-app prompts (Task 1), `cookies()`/`proxy.ts` API verification against local docs (Task 3), TopNav prop shape (Task 4 Step 5), Docker-running prerequisite (Task 5 Step 1).

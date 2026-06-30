# Ranking Search Volume (GSV + per-country SV) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show global search volume (GSV) and per-country search volume (SV) on the ranking dashboard, with a manual admin grid editor to maintain them.

**Architecture:** Reuse the existing `keywords.global_volume` column and `keyword_volumes` table (no migration). Read path: a pure map-builder feeds two optional props into `RankingGrid` (GSV column + per-cell SV). Write path: an admin-gated `/manage/volumes` grid editor posts the whole matrix to a `saveVolumes` server action that updates GSV and upserts/deletes SV.

**Tech Stack:** Next.js 16 (App Router, server actions), TypeScript, Tailwind 4, Supabase JS (PostgREST), Vitest + jsdom + @testing-library/react.

## Global Constraints

- **No DB migration.** `keywords.global_volume` and `keyword_volumes(keyword_id, country_id, volume)` already exist with anon-read + admin-write RLS. Do not add migrations.
- **Volumes are current values, not week-stamped.** Fetch once per page load; apply to every week's grid.
- **Map keys must match `GridRow`:** keyword **text** and country **code** (not ids).
- **All writes admin-gated** via `await requireAdmin()` server-side — never trust the client.
- **Test command:** `npx vitest run <path>` (config: jsdom, globals on, `@` → `src`, `server-only` stubbed).
- **Volumes are non-negative integers.** Empty input → `null`. Non-digit or negative → validation error.
- **Cleared SV cell deletes its row** (sparse table), it does not store null.
- Follow existing patterns: server actions return `{ error?, success? }`, client forms use `useActionState`, commit after each green step.

---

### Task 1: `formatVolume` display helper

**Files:**
- Create: `src/lib/format.ts`
- Test: `src/lib/format.test.ts`

**Interfaces:**
- Produces: `formatVolume(n: number | null | undefined): string` — thousands-separated, `"—"` for null/undefined.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/format.test.ts
import { describe, it, expect } from "vitest";
import { formatVolume } from "./format";

describe("formatVolume", () => {
  it("adds thousands separators", () => {
    expect(formatVolume(12000)).toBe("12,000");
    expect(formatVolume(8100)).toBe("8,100");
  });
  it("renders zero as 0, not a dash", () => {
    expect(formatVolume(0)).toBe("0");
  });
  it("renders null and undefined as an em dash", () => {
    expect(formatVolume(null)).toBe("—");
    expect(formatVolume(undefined)).toBe("—");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/format.test.ts`
Expected: FAIL — cannot find module `./format`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/format.ts
/** Thousands-separated integer for display; em dash for missing values. */
export function formatVolume(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/format.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts
git commit -m "feat: add formatVolume display helper"
```

---

### Task 2: `parseVolumeForm` — parse the editor's matrix into a typed payload

**Files:**
- Create: `src/lib/manage/volumes.ts`
- Test: `src/lib/manage/volumes.test.ts`

**Interfaces:**
- Produces:
  - `type VolumePayload = { globals: { keyword_id: string; volume: number | null }[]; cells: { keyword_id: string; country_id: string; volume: number | null }[]; errors: string[] }`
  - `parseVolumeForm(formData: FormData): VolumePayload`
- Field naming contract (consumed by Task 6 editor): GSV input `g:<keyword_id>`; SV input `v:<keyword_id>:<country_id>`. UUIDs contain hyphens, never colons, so `:` is a safe delimiter.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/manage/volumes.test.ts
import { describe, it, expect } from "vitest";
import { parseVolumeForm } from "./volumes";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

describe("parseVolumeForm", () => {
  it("parses GSV and per-country SV", () => {
    const out = parseVolumeForm(fd({ "g:kw1": "12000", "v:kw1:cAE": "8100" }));
    expect(out.errors).toEqual([]);
    expect(out.globals).toEqual([{ keyword_id: "kw1", volume: 12000 }]);
    expect(out.cells).toEqual([{ keyword_id: "kw1", country_id: "cAE", volume: 8100 }]);
  });
  it("treats empty input as null (cleared)", () => {
    const out = parseVolumeForm(fd({ "g:kw1": "", "v:kw1:cAE": "  " }));
    expect(out.errors).toEqual([]);
    expect(out.globals).toEqual([{ keyword_id: "kw1", volume: null }]);
    expect(out.cells).toEqual([{ keyword_id: "kw1", country_id: "cAE", volume: null }]);
  });
  it("rejects non-numeric and negative values", () => {
    const out = parseVolumeForm(fd({ "g:kw1": "abc", "v:kw1:cAE": "-5" }));
    expect(out.errors.length).toBe(2);
  });
  it("ignores unrelated form fields", () => {
    const out = parseVolumeForm(fd({ other: "x", "g:kw1": "10" }));
    expect(out.globals).toEqual([{ keyword_id: "kw1", volume: 10 }]);
    expect(out.cells).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/manage/volumes.test.ts`
Expected: FAIL — cannot find module `./volumes`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/manage/volumes.ts
export type VolumePayload = {
  globals: { keyword_id: string; volume: number | null }[];
  cells: { keyword_id: string; country_id: string; volume: number | null }[];
  errors: string[];
};

// "" -> null; non-negative integer -> number; anything else -> error (returns null + pushes).
function coerce(raw: FormDataEntryValue, label: string, errors: string[]): number | null {
  const s = String(raw).trim();
  if (s === "") return null;
  if (!/^\d+$/.test(s)) {
    errors.push(`${label} must be a whole number ≥ 0`);
    return null;
  }
  return parseInt(s, 10);
}

export function parseVolumeForm(formData: FormData): VolumePayload {
  const globals: VolumePayload["globals"] = [];
  const cells: VolumePayload["cells"] = [];
  const errors: string[] = [];

  for (const [key, value] of formData.entries()) {
    const g = key.match(/^g:(.+)$/);
    if (g) {
      globals.push({ keyword_id: g[1], volume: coerce(value, `GSV ${g[1]}`, errors) });
      continue;
    }
    const v = key.match(/^v:([^:]+):(.+)$/);
    if (v) {
      cells.push({ keyword_id: v[1], country_id: v[2], volume: coerce(value, `SV ${v[1]}/${v[2]}`, errors) });
    }
  }
  return { globals, cells, errors };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/manage/volumes.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/manage/volumes.ts src/lib/manage/volumes.test.ts
git commit -m "feat: parse volume grid form into typed payload"
```

---

### Task 3: `buildVolumeMaps` + `getKeywordVolumes` (read path)

**Files:**
- Create: `src/lib/data/volume-maps.ts`
- Test: `src/lib/data/volume-maps.test.ts`
- Modify: `src/lib/data/ranking.ts`

**Interfaces:**
- Produces:
  - `type KeywordVolumes = { global: Map<string, number>; perMarket: Map<string, number> }`
  - `buildVolumeMaps(keywords, volumes): KeywordVolumes` (pure)
  - `getKeywordVolumes(): Promise<KeywordVolumes>` (in `ranking.ts`)
- Consumes (Task 4, 5): `KeywordVolumes` maps — `global` keyed by keyword text, `perMarket` keyed by `` `${keyword}|${country}` ``.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/data/volume-maps.test.ts
import { describe, it, expect } from "vitest";
import { buildVolumeMaps } from "./volume-maps";

describe("buildVolumeMaps", () => {
  it("builds global and per-market maps, skipping nulls", () => {
    const { global, perMarket } = buildVolumeMaps(
      [
        { text: "استرداد", global_volume: 12000 },
        { text: "نصب", global_volume: null },
      ],
      [
        { volume: 8100, keywords: { text: "استرداد" }, countries: { code: "AE" } },
        { volume: null, keywords: { text: "استرداد" }, countries: { code: "SA" } },
      ],
    );
    expect(global.get("استرداد")).toBe(12000);
    expect(global.has("نصب")).toBe(false);
    expect(perMarket.get("استرداد|AE")).toBe(8100);
    expect(perMarket.has("استرداد|SA")).toBe(false);
  });
  it("tolerates embedded relations returned as arrays", () => {
    const { perMarket } = buildVolumeMaps([], [
      { volume: 50, keywords: [{ text: "x" }], countries: [{ code: "OM" }] },
    ]);
    expect(perMarket.get("x|OM")).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/data/volume-maps.test.ts`
Expected: FAIL — cannot find module `./volume-maps`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/data/volume-maps.ts
export type KeywordVolumes = {
  global: Map<string, number>;     // key: keyword text
  perMarket: Map<string, number>;  // key: `${keyword}|${country}`
};

type Rel<T> = T | T[] | null | undefined;
const one = <T,>(r: Rel<T>): T | undefined => (Array.isArray(r) ? r[0] : r ?? undefined);

export function buildVolumeMaps(
  keywords: { text: string; global_volume: number | null }[],
  volumes: { volume: number | null; keywords: Rel<{ text: string }>; countries: Rel<{ code: string }> }[],
): KeywordVolumes {
  const global = new Map<string, number>();
  for (const k of keywords) {
    if (k.global_volume != null) global.set(k.text, k.global_volume);
  }
  const perMarket = new Map<string, number>();
  for (const v of volumes) {
    const kw = one(v.keywords)?.text;
    const cc = one(v.countries)?.code;
    if (kw && cc && v.volume != null) perMarket.set(`${kw}|${cc}`, v.volume);
  }
  return { global, perMarket };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/data/volume-maps.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add `getKeywordVolumes` to the data layer**

Append to `src/lib/data/ranking.ts`:

```ts
import { buildVolumeMaps, type KeywordVolumes } from "./volume-maps";
export type { KeywordVolumes };

/** Current GSV + per-market SV (not week-stamped). Empty maps on error. */
export async function getKeywordVolumes(): Promise<KeywordVolumes> {
  const supabase = await createServerSupabaseClient();
  const [{ data: kws }, { data: vols }] = await Promise.all([
    supabase.from("keywords").select("text, global_volume"),
    supabase.from("keyword_volumes").select("volume, keywords(text), countries(code)"),
  ]);
  return buildVolumeMaps(
    (kws ?? []) as { text: string; global_volume: number | null }[],
    (vols ?? []) as Parameters<typeof buildVolumeMaps>[1],
  );
}
```

> Note: `import { buildVolumeMaps, type KeywordVolumes }` goes at the top of the file with the other imports; the function body goes at the end. The existing `createServerSupabaseClient` import is already present.

- [ ] **Step 6: Verify the project still type-checks/builds**

Run: `npx vitest run src/lib/data/volume-maps.test.ts` (still PASS) and `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/data/volume-maps.ts src/lib/data/volume-maps.test.ts src/lib/data/ranking.ts
git commit -m "feat: read keyword GSV + per-market SV into lookup maps"
```

---

### Task 4: Render GSV column + per-cell SV in `RankingGrid`

**Files:**
- Modify: `src/components/ranking/RankingGrid.tsx`
- Test: `src/components/ranking/RankingGrid.test.tsx`

**Interfaces:**
- Consumes: `KeywordVolumes` maps (Task 3), `formatVolume` (Task 1).
- Produces: `RankingGrid` accepts two new optional props: `globalVolume?: Map<string, number>`, `marketVolume?: Map<string, number>`. Absent → renders `"—"`, no regression.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ranking/RankingGrid.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RankingGrid } from "./RankingGrid";
import type { GridRow } from "@/lib/data/ranking";

const rows: GridRow[] = [
  { keyword: "استرداد", keyword_sort: 0, country: "AE", country_sort: 0, position: 3, prev_position: 5 },
];

describe("RankingGrid volumes", () => {
  it("renders a Volume header, the GSV value, and per-cell SV", () => {
    render(
      <RankingGrid
        rows={rows}
        globalVolume={new Map([["استرداد", 12000]])}
        marketVolume={new Map([["استرداد|AE", 8100]])}
      />,
    );
    expect(screen.getByText("Volume")).toBeTruthy();
    expect(screen.getByText("12,000")).toBeTruthy();
    expect(screen.getByText("8,100")).toBeTruthy();
  });
  it("renders em dashes when no volume maps are provided", () => {
    render(<RankingGrid rows={rows} />);
    // GSV cell + SV cell both fall back to —
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ranking/RankingGrid.test.tsx`
Expected: FAIL — `Volume` header / values not found (props don't exist yet).

- [ ] **Step 3: Implement the props and rendering**

In `src/components/ranking/RankingGrid.tsx`:

3a. Add the import near the top (after the existing imports):

```tsx
import { formatVolume } from "@/lib/format";
```

3b. Change the component signature and destructuring:

```tsx
export function RankingGrid({
  rows,
  globalVolume,
  marketVolume,
}: {
  rows: GridRow[];
  globalVolume?: Map<string, number>;
  marketVolume?: Map<string, number>;
}) {
```

3c. Add a `Volume` header `<th>` immediately AFTER the existing "Keyword" `<th>` (before the `{countries.map(...)}` header cells):

```tsx
<th className="border border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
  Volume
</th>
```

3d. Add a GSV `<td>` immediately AFTER the keyword-text `<td>` (the one rendering `{kw}`), before the `{countries.map(...)}` body cells:

```tsx
<td className="border border-slate-200 px-3 py-1.5 text-right tabular-nums text-xs text-slate-600">
  {formatVolume(globalVolume?.get(kw))}
</td>
```

3e. Inside each country `<td>`, render the SV under the existing `<Cell />`. Replace the existing cell body:

```tsx
<td key={c} className="border border-slate-200 px-3 py-1.5 text-center">
  <Cell position={row?.position ?? null} prev={row?.prev_position ?? null} />
  <div className="mt-0.5 text-[11px] tabular-nums text-slate-400">{formatVolume(marketVolume?.get(`${kw}|${c}`))}</div>
</td>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ranking/RankingGrid.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ranking/RankingGrid.tsx src/components/ranking/RankingGrid.test.tsx
git commit -m "feat: show GSV column and per-cell SV in ranking grid"
```

---

### Task 5: Wire volumes into the ranking page

**Files:**
- Modify: `src/app/(app)/ranking/page.tsx`

**Interfaces:**
- Consumes: `getKeywordVolumes` (Task 3), `RankingGrid` volume props (Task 4).

- [ ] **Step 1: Fetch volumes once and pass to every grid**

In `src/app/(app)/ranking/page.tsx`:

1a. Add to the imports:

```tsx
import { getRankingGridByWeek, getKeywordVolumes } from "@/lib/data/ranking";
```

(remove the old `getRankingGridByWeek`-only import line — merge into the one above.)

1b. After `const weekly = await getRankingGridByWeek(selected.id, 26);`, add:

```tsx
const volumes = await getKeywordVolumes();
```

1c. Update the grid render inside `weekly.map(...)`:

```tsx
<RankingGrid rows={rows} globalVolume={volumes.global} marketVolume={volumes.perMarket} />
```

- [ ] **Step 2: Add an admin link to the volumes editor**

Inside the `isAdmin` `<details>` panel, after `<ImportRankings siteId={selected.id} />`, add:

```tsx
<a href="/manage/volumes" className="inline-block text-sm font-medium text-slate-700 underline hover:text-slate-900">
  Edit search volumes (GSV + per-market) →
</a>
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: no new type errors. (Route `/manage/volumes` is created in Task 7; the link is a plain `<a>` so this compiles now.)

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/ranking/page.tsx
git commit -m "feat: surface volumes on ranking page + link to editor"
```

---

### Task 6: `VolumeGridEditor` client component

**Files:**
- Create: `src/components/manage/VolumeGridEditor.tsx`

**Interfaces:**
- Consumes: `formatVolume` (Task 1); the field-naming contract from Task 2 (`g:<id>`, `v:<id>:<id>`).
- Produces: `VolumeGridEditor` props:

```ts
{
  keywords: { id: string; text: string }[];
  countries: { id: string; code: string }[];
  globalPrefill: Record<string, number | null>;          // key: keyword_id
  cellPrefill: Record<string, number | null>;            // key: `${keyword_id}|${country_id}`
  action: (prev: { error?: string; success?: boolean } | undefined, fd: FormData)
    => Promise<{ error?: string; success?: boolean } | undefined>;
}
```

- [ ] **Step 1: Create the component**

```tsx
// src/components/manage/VolumeGridEditor.tsx
"use client";

import { useActionState } from "react";

type State = { error?: string; success?: boolean } | undefined;

const MARKET_LABELS: Record<string, string> = { AE: "UAE" };
const marketLabel = (code: string) => MARKET_LABELS[code] ?? code;

export function VolumeGridEditor({
  keywords, countries, globalPrefill, cellPrefill, action,
}: {
  keywords: { id: string; text: string }[];
  countries: { id: string; code: string }[];
  globalPrefill: Record<string, number | null>;
  cellPrefill: Record<string, number | null>;
  action: (prev: State, fd: FormData) => Promise<State>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  const numCell =
    "w-20 rounded border border-slate-300 px-1.5 py-1 text-right tabular-nums";

  return (
    <form action={formAction} className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-slate-300">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Keyword</th>
              <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">GSV (global)</th>
              {countries.map((c) => (
                <th key={c.id} className="border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">{marketLabel(c.code)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keywords.map((k) => (
              <tr key={k.id} className="even:bg-slate-50/40">
                <td className="border border-slate-200 px-3 py-1.5 whitespace-nowrap text-slate-800">{k.text}</td>
                <td className="border border-slate-200 px-2 py-1.5 text-right">
                  <input name={`g:${k.id}`} defaultValue={globalPrefill[k.id] ?? ""} inputMode="numeric" placeholder="—" className={numCell} />
                </td>
                {countries.map((c) => (
                  <td key={c.id} className="border border-slate-200 px-2 py-1.5 text-center">
                    <input name={`v:${k.id}:${c.id}`} defaultValue={cellPrefill[`${k.id}|${c.id}`] ?? ""} inputMode="numeric" placeholder="—" className={numCell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "Saving…" : "Save volumes"}
        </button>
        {state?.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
        {state?.success ? <span className="text-sm text-green-600">Saved.</span> : null}
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new type errors. (No standalone unit test — parsing logic is covered by Task 2; the component is verified end-to-end in Task 8.)

- [ ] **Step 3: Commit**

```bash
git add src/components/manage/VolumeGridEditor.tsx
git commit -m "feat: add VolumeGridEditor client component"
```

---

### Task 7: `saveVolumes` action + `/manage/volumes` page + nav + de-dupe GSV field

**Files:**
- Create: `src/app/(app)/manage/volumes/actions.ts`
- Create: `src/app/(app)/manage/volumes/page.tsx`
- Modify: `src/app/(app)/manage/layout.tsx`
- Modify: `src/lib/manage/entities.ts`

**Interfaces:**
- Consumes: `parseVolumeForm` (Task 2), `VolumeGridEditor` (Task 6), `requireAdmin`, `createServerSupabaseClient`.
- Produces: `saveVolumes(prev, formData)` server action returning `{ error?, success? }`.

- [ ] **Step 1: Create the server action**

```ts
// src/app/(app)/manage/volumes/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseVolumeForm } from "@/lib/manage/volumes";

export type VolumeActionState = { error?: string; success?: boolean } | undefined;

export async function saveVolumes(_prev: VolumeActionState, formData: FormData): Promise<VolumeActionState> {
  await requireAdmin();
  const { globals, cells, errors } = parseVolumeForm(formData);
  if (errors.length) return { error: errors.join(" ") };

  const supabase = await createServerSupabaseClient();

  // GSV: per-keyword update on keywords.global_volume.
  for (const g of globals) {
    const { error } = await supabase.from("keywords").update({ global_volume: g.volume }).eq("id", g.keyword_id);
    if (error) return { error: error.message };
  }

  // SV: upsert filled cells, delete cleared ones (keeps keyword_volumes sparse).
  const toUpsert = cells.filter((c) => c.volume !== null);
  const toDelete = cells.filter((c) => c.volume === null);
  if (toUpsert.length) {
    const { error } = await supabase.from("keyword_volumes").upsert(toUpsert, { onConflict: "keyword_id,country_id" });
    if (error) return { error: error.message };
  }
  for (const c of toDelete) {
    const { error } = await supabase.from("keyword_volumes").delete().eq("keyword_id", c.keyword_id).eq("country_id", c.country_id);
    if (error) return { error: error.message };
  }

  revalidatePath("/ranking");
  revalidatePath("/manage/volumes");
  return { success: true };
}
```

- [ ] **Step 2: Create the page**

```tsx
// src/app/(app)/manage/volumes/page.tsx
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { VolumeGridEditor } from "@/components/manage/VolumeGridEditor";
import { saveVolumes } from "./actions";

export default async function VolumesPage() {
  const supabase = await createServerSupabaseClient();
  const [{ data: kws }, { data: ctys }, { data: vols }] = await Promise.all([
    supabase.from("keywords").select("id, text, global_volume").order("sort_order"),
    supabase.from("countries").select("id, code").order("sort_order"),
    supabase.from("keyword_volumes").select("keyword_id, country_id, volume"),
  ]);

  const keywords = (kws ?? []).map((k) => ({ id: k.id as string, text: k.text as string }));
  const countries = (ctys ?? []).map((c) => ({ id: c.id as string, code: c.code as string }));

  const globalPrefill: Record<string, number | null> = {};
  for (const k of (kws ?? []) as Array<{ id: string; global_volume: number | null }>) {
    globalPrefill[k.id] = k.global_volume;
  }
  const cellPrefill: Record<string, number | null> = {};
  for (const v of (vols ?? []) as Array<{ keyword_id: string; country_id: string; volume: number | null }>) {
    cellPrefill[`${v.keyword_id}|${v.country_id}`] = v.volume;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Search Volumes</h1>
      <p className="text-xs text-slate-500">
        Global search volume (GSV) per keyword and per-market search volume (SV). Blank = unknown. Saved values appear on the ranking grid.
      </p>
      <VolumeGridEditor
        keywords={keywords}
        countries={countries}
        globalPrefill={globalPrefill}
        cellPrefill={cellPrefill}
        action={saveVolumes}
      />
    </div>
  );
}
```

> The parent `manage/layout.tsx` already calls `await requireAdmin()`, so this page is admin-gated by the layout; the `saveVolumes` action re-checks server-side.

- [ ] **Step 3: Add the nav link**

In `src/app/(app)/manage/layout.tsx`, inside `<nav>`, after the `{Object.values(ENTITIES).map(...)}` block, add:

```tsx
<Link href="/manage/volumes" className="rounded px-2 py-1 text-slate-700 hover:bg-slate-100">
  Search Volumes
</Link>
```

- [ ] **Step 4: Remove the now-duplicate GSV field from the keywords entity**

In `src/lib/manage/entities.ts`, delete this line from the `keywords` entity `fields` array:

```ts
{ name: "global_volume", label: "Global volume", type: "number" },
```

(GSV is now owned by the volumes editor; leaving it would create two sources of truth. `build-row.test.ts` uses its own inline fields and is unaffected.)

- [ ] **Step 5: Verify build + full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests PASS (including the existing `nlu.eval` / `smart.eval` suites — untouched).

- [ ] **Step 6: Commit**

```bash
git add src/app/(app)/manage/volumes/actions.ts src/app/(app)/manage/volumes/page.tsx src/app/(app)/manage/layout.tsx src/lib/manage/entities.ts
git commit -m "feat: admin volumes grid editor at /manage/volumes"
```

---

### Task 8: Manual end-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Build the app**

Run: `npm run build`
Expected: build succeeds, `/manage/volumes` listed in the route output.

- [ ] **Step 2: Run locally and verify the flow**

Run: `npm run dev`, then in the browser:
- Log in as admin (`admin123` / `admin123`).
- Go to `/manage/volumes` (or via the ranking page's "Edit search volumes →" link). Enter a GSV for one keyword and an SV for one keyword×market. Click **Save volumes** → "Saved." appears.
- Go to `/ranking`: confirm the new **Volume** column shows the GSV and the edited cell shows its SV under the rank.
- Re-open `/manage/volumes`: confirm the saved values are prefilled.
- Clear a previously-saved SV cell, Save, reload: confirm it now shows "—" on the grid (row deleted).
- Log out (anon view) and confirm volumes are still visible (public read).

- [ ] **Step 3: Commit any fixes, then finish the branch**

If verification surfaced fixes, commit them. Then proceed to the finishing-a-development-branch skill to merge/PR `feat/ranking-search-volume`.

---

## Self-Review

**Spec coverage:**
- GSV display → Task 4 (column) + Task 5 (wiring). ✓
- Per-country SV display → Task 4 (per-cell) + Task 5. ✓
- Manual entry grid editor → Task 6 (UI) + Task 7 (page/action). ✓
- No migration / reuse existing tables → Global Constraints + Task 3/7 use existing tables. ✓
- Public read / admin write → Task 7 `requireAdmin`; read path relies on existing anon RLS. ✓
- Cleared cell deletes row → Task 7 Step 1 `toDelete`. ✓
- GSV single source of truth → Task 7 Step 4 removes the entities field. ✓
- Pure helpers TDD'd → Task 1 (`formatVolume`), Task 2 (`parseVolumeForm`), Task 3 (`buildVolumeMaps`). ✓
- Out-of-scope items (DataForSEO, report deck, assistant) → intentionally excluded. ✓

**Placeholder scan:** No TBD/TODO; every code step contains complete code. ✓

**Type consistency:** `KeywordVolumes` ({global, perMarket}) consistent across Tasks 3/4/5. `VolumePayload` ({globals, cells, errors}) consistent across Tasks 2/7. Field-naming contract (`g:<id>`, `v:<id>:<id>`) consistent across Tasks 2/6. Action state shape `{ error?, success? }` consistent across Tasks 6/7. ✓

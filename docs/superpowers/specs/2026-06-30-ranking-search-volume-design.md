# Ranking Search Volume (GSV + per-country SV) — Design

**Date:** 2026-06-30
**Status:** Approved (design)
**Scope:** Display global search volume (GSV) and per-country search volume (SV) on the ranking dashboard, with a manual admin entry editor.

## Problem

The ranking grid (15 Arabic keywords × 6 GCC markets) shows rank positions but no search-volume context. A keyword ranking #3 is far more valuable in a high-volume market than a low-volume one, and the client report has no way to convey that. The data model already has the columns for volume but nothing populates or displays them.

## Goal

- Show **GSV** (global search volume per keyword) as a column on the ranking grid.
- Show **per-country SV** (search volume per keyword × market) inside each grid cell, under the rank.
- Provide a **manual admin entry** screen to maintain these values in one place.

## Non-goals (explicit out of scope)

- Auto-pulling volumes from DataForSEO / Google Keyword Planner (chosen: manual entry).
- Surfacing volumes in the monthly report deck (`tools/render_report_deck.py`).
- Teaching the tokenless assistant to answer volume questions.

These are deferred follow-ups, not part of this build.

## Existing state (verified against code)

- `keywords.global_volume integer` — exists (migration `0002_data.sql`). Currently entered only via the generic manage form; **read by no page**.
- `keyword_volumes (id, keyword_id, country_id, volume, unique(keyword_id, country_id))` — exists (`0002_data.sql`). **No entry UI, read by no page.**
- Both tables already have **public (anon) read** and **admin-only write** RLS (`0010_public_read.sql`, `0003_security.sql`). **No migration is required for this feature.**
- Ranking grid is rendered from RPCs `ranking_grid` / `ranking_grid_multi`, mapped to `GridRow` (keyword text + country code keys) in `src/lib/data/ranking.ts`, displayed by `src/components/ranking/RankingGrid.tsx`.
- Volumes are **current values, not week-stamped** — one set of numbers applies to every week shown.

## Architecture

### 1. Data model — unchanged

No schema migration. Reuse `keywords.global_volume` (GSV) and `keyword_volumes.volume` (per-market SV). Writes are upserts keyed on the existing `unique(keyword_id, country_id)`.

### 2. Read path (display)

**`src/lib/data/ranking.ts` — new `getKeywordVolumes()`**

Returns:

```ts
type KeywordVolumes = {
  global: Map<string, number>;        // key: keyword text
  perMarket: Map<string, number>;     // key: `${keyword}|${country}` (matches GridRow keys)
};
```

Implementation: two PostgREST reads (no new RPC).
- `keywords` → `select("text, global_volume")` → build `global` map (skip null).
- `keyword_volumes` → `select("volume, keywords(text), countries(code)")` (embedded resources) → build `perMarket` map keyed `text|code` (skip null volume).

Keys are keyword **text** and country **code** so they line up with the existing `GridRow.keyword` / `GridRow.country` without changing the RPCs.

**`src/components/ranking/RankingGrid.tsx` — two new optional props**

```ts
{ rows: GridRow[]; globalVolume?: Map<string, number>; marketVolume?: Map<string, number> }
```

- New header `<th>` **"Volume"** inserted **after the Keyword column**. Per row, render `formatVolume(globalVolume?.get(kw))`.
- In each country `<td>`, below the existing `<Cell>`, render a small grey `tabular-nums` line: `formatVolume(marketVolume?.get(`${kw}|${c}`))`.
- Props are optional and default to undefined → component renders "—" everywhere, so existing tests/usages stay valid.

**`src/app/(app)/ranking/page.tsx`**

Call `getKeywordVolumes()` once, pass `globalVolume` / `marketVolume` to every `<RankingGrid>` (all weeks share the same current volumes).

### 3. Write path (entry) — admin volumes grid editor

**Route:** `src/app/(app)/manage/volumes/page.tsx` (static segment; takes priority over the sibling `manage/[entity]` dynamic route). Admin-gated via `isAdminRole(getCurrentRole())`, matching the rest of `(app)/manage`.

Server component loads:
- `keywords` (`id, text, sort_order`, ordered),
- `countries` (`id, code, sort_order`, ordered),
- existing `keyword_volumes` (`keyword_id, country_id, volume`),
- `keywords.global_volume`,

builds a prefill map, and renders the editor.

**`src/components/manage/VolumeGridEditor.tsx` (client)**

Matrix of `<input type="number" min="0">`:
- Rows = keywords (Arabic text + English label, like the ranking grid).
- Columns = **GSV**, then one per market (UAE/KSA/KW/QA/BH/OM).
- Prefilled with current values; one **Save volumes** button submits the whole grid to the server action.
- Input names encode identity, e.g. `g:<keyword_id>` for GSV and `v:<keyword_id>:<country_id>` for SV.

**Server action `saveVolumes(formData)`** (in `src/app/(app)/manage/volumes/actions.ts`)

1. Admin-gate (re-check server-side; never trust the client).
2. Parse with the pure `parseVolumeForm` helper → `{ globals: {keyword_id, volume|null}[], cells: {keyword_id, country_id, volume|null}[] }`.
3. `keywords` updates: set `global_volume` per keyword.
4. `keyword_volumes`: `upsert(cells, { onConflict: "keyword_id,country_id" })`; blank/null → delete that row (or upsert null) so cleared cells don't keep stale values.
5. `revalidatePath("/ranking")` and `revalidatePath("/manage/volumes")`.

**Discoverability:** link to `/manage/volumes` from the manage index (`manage/page.tsx`) and from the ranking page's admin panel.

**Consolidation:** remove the `global_volume` field from the `keywords` entity in `src/lib/manage/entities.ts` so the volumes editor is the single source of truth for GSV. (`build-row.test.ts` uses its own inline fields, so it is unaffected.)

### 4. Pure helpers (TDD targets)

- **`parseVolumeForm(formData)`** in `src/lib/manage/volumes.ts` — turns form fields into the typed payload above. Empty string → `null`; non-numeric → validation error; negatives rejected. Mirrors the style of `build-row.ts`.
- **`formatVolume(n: number | null | undefined): string`** — thousands separators (e.g. `12,000`), `"—"` for null/undefined. Used by both the grid and the editor's display.

## Data flow

```
Admin edits  →  VolumeGridEditor  →  saveVolumes (server action, admin-gated)
                                        ├─ update keywords.global_volume
                                        └─ upsert/delete keyword_volumes
                                        └─ revalidate /ranking, /manage/volumes

Page load   →  getKeywordVolumes() (PostgREST, anon-readable)
            →  { global, perMarket }  →  <RankingGrid globalVolume marketVolume>
            →  GSV column + SV-under-rank in each cell
```

## Error handling

- `getKeywordVolumes()` returns empty maps on query error → grid shows "—", never throws (matches `getRankingGrid` returning `[]` on error).
- `saveVolumes` returns a typed `{ ok, errors }` result; the editor surfaces field errors inline and does not clear the form on failure.
- Non-admin hitting the route or action → redirect/forbidden, same pattern as existing manage pages.

## Testing strategy

- Unit (Vitest, TDD-first): `parseVolumeForm` (valid grid, empty→null, non-numeric→error, negative→error, partial grid) and `formatVolume` (thousands, null→"—", zero).
- Component: `RankingGrid` renders the Volume column and per-cell SV when maps are provided, and "—" when absent (no regression to existing rank rendering).
- Keep the existing `nlu.eval` / `smart.eval` suites green (assistant untouched).
- Manual verification: enter volumes in the editor → confirm they appear on the ranking grid for the logged-out (anon) view.

## Deployment

Push to `master` → Vercel auto-deploys `grg-dashboard.vercel.app`. **No DB migration to apply** (columns already live), so no pooler/`db:apply` step.

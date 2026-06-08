# Ranking Report — Logic, Format & Structure

> **Implementation status (2026-06-08):** The live dashboard currently implements the **core** of this
> logic via **manual weekly entry** — positions `1`–`100` / `NR`, movement vs. the previous week, the
> green/red color rules, and the stats cards. The **xlsx upload / Snapshot / BP-LP categories / matrix /
> carry-forward** parts below are the *target* design and are **not built yet** (pending decision).
> The markets and keywords below now reflect the real GCC client data (seeded in the database).

## Overview

The dashboard tracks SEO keyword positions across **six GCC markets** (Saudi Arabia, Qatar, Oman, Kuwait, Bahrain, UAE). In the target design, data is uploaded as `.xlsx` files and stored as **Snapshots** — a point-in-time picture of every keyword's ranking on a given date. (The current build instead captures one **week** of positions per manual entry.)

---

## Categories

| Category | Domain Type | Countries |
|----------|-------------|-----------|
| **BP Sites** | Main/affiliate domains | SA, QA, OM, KW, BH, AE |
| **LP Sites** | Landing-page domains | SA, QA, OM, KW, BH, AE |

Each upload is tagged to one category. BP and LP domain namespaces are kept strictly separate — a domain only matches a brand if it belongs to the correct category.

> **Note:** the BP/LP split came from an affiliate-casino setup. For this single trading-recovery service it may not apply — confirm whether you actually have two domain categories, or whether ranking is just one site (or a small set of sites) across the 6 markets.

---

## Tracked Keywords (Arabic — trading-scam / fund-recovery niche)

15 keywords tracked across the 6 GCC markets → the ranking grid is **15 × 6 = 90** keyword×country cells per week. All are seeded in the database (Manage → Keywords).

| # | Keyword (Arabic) | Meaning |
|---|---|---|
| 1 | إغلاق صفقات التداول | closing trading positions |
| 2 | احتيال منصات التداول | trading-platform fraud |
| 3 | استرجاع أموال التداول | recovering trading funds |
| 4 | استرجاع أموال الفوركس | recovering forex funds |
| 5 | استرداد خسائر التداول | recovering trading losses |
| 6 | استشارة لاسترداد الأموال | fund-recovery consultation |
| 7 | التلاعب بصفقات التداول | manipulation of trading deals |
| 8 | تجميد حساب التداول | freezing a trading account |
| 9 | تصفية حساب التداول | liquidating a trading account |
| 10 | شكوى ضد شركة تداول | complaint against a trading company |
| 11 | علامات نصب التداول | signs of a trading scam |
| 12 | عمولة سحب التداول | trading withdrawal fee |
| 13 | محامي شركات التداول | trading-companies lawyer |
| 14 | مشاكل سحب التداول | trading withdrawal problems |
| 15 | وسيط تداول لا يرد | unresponsive trading broker |

---

## Snapshot & Timeframe

A **Snapshot** is one complete dataset for a single date.

- **Flat format** — one sheet, one date per upload. The date is read from the `Last Check` (or `Date`) column and the most common value wins.
- **Matrix format** — one sheet per brand, multiple dates stacked vertically. Each date marker creates a separate Snapshot. All brands from the same date are merged into one Snapshot.

Snapshots are displayed **newest first**. The dashboard defaults to the most recent Snapshot and lets you switch between historical ones via the tabs at the top.

---

## Record Fields

Every row in a Snapshot is a **RankingRecord** with these fields:

| Field | Description |
|-------|-------------|
| `domain` | The site domain (e.g. `lucky7even.com`) |
| `keyword` | The search term being tracked |
| `country` | 2-letter market code: `SA`, `QA`, `OM`, `KW`, `BH`, `AE` |
| `position` | Current rank in search results (number, or `NR`) |
| `change` | Movement indicator from the source file |
| `previous` | Previous position (rarely populated; superseded by cross-snapshot comparison) |
| `date` | `yyyy-MM-dd` date from the source file |

Optional fields (BP matrix only):

| Field | Description |
|-------|-------------|
| `searchVolume` | Per-(domain, country) local search volume |
| `globalSearchVolume` | Per-keyword global search volume (same value for all records of that keyword) |
| `affiliateUrl` | Affiliate link for the keyword+domain+country combination |

---

## Position Values

| Value | Meaning |
|-------|---------|
| `1` – `100` | Ranked position in search results (lower = better) |
| `NR` | Not in the top 100. Stored as the string `"NR"`. Source variants: `"Not Ranking"`, `"Not in top 100"`, `"-"`, `"nr"` — all normalise to `NR`. |
| _(empty)_ | No data for that keyword in that snapshot. Displayed as a dim `–`. |

---

## Change / Movement Format

### BP Sites (matrix format)

Cells in the Excel look like: `4 ⇓ (1)`

| Part | Meaning |
|------|---------|
| `4` | Current position |
| `⇓` | Direction of movement (down = rank worsened) |
| `(1)` | Previous position |

The app reads `⇓ (1)` as the `change` field verbatim. A drop means the rank number **increased** (e.g. moved from position 1 → 4). A rise means the rank number **decreased** (e.g. moved from position 6 → 4).

Edge case: if the number in parens equals the current position (e.g. `4 ⇑ (4)`), there was no actual movement — shown as plain black with no arrow.

### LP Sites (matrix format)

Cells in the Excel look like: `12 ⇓ 10`

| Part | Meaning |
|------|---------|
| `12` | Current position |
| `⇓` | Direction of movement |
| `10` | Previous position (no parens) |

Special case — entered from NR: `49 ⇑` (no previous value, came from outside top 100).

### Flat format

The `Change` column holds a plain numeric delta or an arrow+number. Interpreted as:
- `+6` / `6` → improved by 6 positions
- `-3` → dropped 3 positions
- `⇑ 6` / `⇓ 3` → same, arrow-prefixed variant

---

## Display Color Logic

The badge next to each position number uses two modes depending on context:

### Cross-snapshot mode (two or more snapshots loaded — BP Sites)

Compares the current snapshot's position against the **previous snapshot** for the same `(domain, keyword, country)` key.

| Condition | Color | Suffix |
|-----------|-------|--------|
| Rank number decreased (e.g. 6 → 4) | Green `#15803D` | `↑ (6)` |
| Rank number increased (e.g. 4 → 6) | Red `#B91C1C` | `↓ (4)` |
| Was `NR`, now has a rank | Green `#15803D` | `↑` |
| Same position | No color | _(none)_ |
| No previous snapshot for this key | No color | _(none)_ |

### Within-file fallback (oldest snapshot / LP Sites)

Uses the `change` field from the source Excel file directly.

| Condition | Color | Suffix |
|-----------|-------|--------|
| Arrow is `⇑` or `↑`, or change is a positive number | Green | Arrow + previous position |
| Arrow is `⇓` or `↓`, or change is a negative number | Red | Arrow + previous position |
| No change / identical previous position | No color | _(none)_ |

---

## Stats Row

Five cards shown at the top of each brand view. Calculated from the active snapshot's filtered records:

| Card | Logic | Note |
|------|-------|------|
| **Top 3** | `position ≤ 3` | Overlaps with Improved / Dropped / Unchanged — does **not** have to sum with the others |
| **Improved** | Effective delta `> 0` (rank number decreased) | Mutually exclusive with Dropped / Unchanged / NR |
| **Dropped** | Effective delta `< 0` (rank number increased) | Mutually exclusive |
| **Unchanged** | No movement, and not NR | Mutually exclusive |
| **Not Ranking** | `position === NR` | Mutually exclusive |

Improved + Dropped + Unchanged + Not Ranking = **Total keywords** for the filtered view.

---

## Carry-Forward (BP Matrix)

`searchVolume`, `globalSearchVolume`, and `affiliateUrl` are often only filled in older snapshots. The app automatically **carries these values forward** to newer snapshots where those fields are blank. This means:

- A keyword with SV populated in the May snapshot will show the same SV in the June snapshot even if the June upload left it blank.
- If the upstream value is cleared or overridden, the carry-forward propagates the new value downstream — raw values are used as the source, not derived ones.

---

## Deduplication

Within a single upload, if the same `(domain, keyword, country)` combination appears more than once, the **last row wins**. This handles re-exports or partial overlaps in the source file.

---

## Date Handling

| Format in source | Stored as | Displayed as |
|-----------------|-----------|--------------|
| `5/20/2026` | `2026-05-20` | `May 20, 2026` |
| `05/13/26` (matrix) | `2026-05-13` | `May 13, 2026` |
| Excel serial number | Converted to `yyyy-MM-dd` | `Month DD, YYYY` |

All dates are stored in local time to avoid UTC boundary shifts (e.g. a midnight date appearing as the previous day in UTC-offset timezones).

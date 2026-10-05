import { Fragment } from "react";
import { rankCell } from "@/lib/ranking/rank-cell.mjs";
import { keywordEnglish } from "@/lib/ranking/keyword-labels";
import type { GridRow } from "@/lib/data/ranking";
import { formatVolume } from "@/lib/format";
import { marketLabel } from "@/lib/market-labels";

const FLAG: Record<string, string> = { AE: "🇦🇪", SA: "🇸🇦", QA: "🇶🇦", KW: "🇰🇼", BH: "🇧🇭", OM: "🇴🇲" };

function Cell({ position, prev }: { position: number | null; prev: number | null }) {
  const cell = rankCell(position, prev);
  if (cell.dir === "lost") {
    // Was ranked last week, gone this week — the worst possible move, so it reads red
    // and carries the position it fell from. Never-ranked stays muted (below).
    return (
      <span
        title={`Dropped out of the top 100 — was #${cell.prev} last week`}
        className="inline-flex items-baseline gap-1 rounded bg-rose-50 px-1.5 py-0.5 ring-1 ring-rose-200"
      >
        <span className="text-xs font-bold text-rose-700">↓ Lost</span>
        <span className="tabular-nums text-xs font-semibold text-rose-500">was {cell.prev}</span>
      </span>
    );
  }
  if (!cell.ranked) {
    return <span className="text-xs text-slate-400">Not in top 100</span>;
  }
  // The previous position goes in parentheses, which is what the legend promises and what
  // rank-cell documents. Bare, "32 ↑ 33" reads as a 33-place jump when it means "now #32,
  // was #33"; "32 ↑ (33)" can only be read one way. The title spells it out either way.
  const move =
    cell.prev == null
      ? null
      : cell.dir === "up"
        ? { cls: "text-emerald-600", glyph: "↑", title: `Improved to #${cell.label} from #${cell.prev} last week` }
        : { cls: "text-rose-500", glyph: "↓", title: `Dropped to #${cell.label} from #${cell.prev} last week` };

  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="tabular-nums font-semibold text-slate-800">{cell.label}</span>
      {(cell.dir === "up" || cell.dir === "down") && move && (
        <span title={move.title} className={`text-xs font-semibold ${move.cls}`}>
          {move.glyph} ({cell.prev})
        </span>
      )}
      {cell.dir === "new" && (
        <span title="Ranking for the first time — no position last week" className="text-xs font-semibold text-emerald-600">
          ↑ new
        </span>
      )}
    </span>
  );
}

export function RankingGrid({
  rows,
  globalVolume,
  marketVolume,
  trackedMarkets,
  roster,
  groups,
}: {
  rows: GridRow[];
  globalVolume?: Map<string, number>;
  marketVolume?: Map<string, number>;
  /**
   * Which markets each keyword is actually tracked in, gathered across the weeks on the
   * page. Without it a market a sweep simply failed to check looks identical to a market
   * the keyword was never tracked in, which silently reclassifies the keyword and
   * shatters the market groups (week 2026-09-07 rendered 10 group headers instead of 2
   * because 17 pairs were missing).
   */
  trackedMarkets?: Map<string, string[]>;
  /**
   * The full keyword and market list this week should show, in order — not just the ones
   * that happen to have a row.
   *
   * A keyword the checker skipped has no row, so deriving the table from `rows` dropped it
   * from the week entirely: country blocks rendered 7, 6 or 9 keywords instead of the 12
   * that are tracked, which reads as "we stopped tracking these". With the roster supplied,
   * every tracked keyword holds its place and the gap shows as "Not checked" — missing
   * data, not a missing keyword. The caller limits the roster to keywords that existed as
   * of that week, so a keyword added later doesn't appear retroactively in old weeks.
   */
  roster?: { keywords: string[]; countries: string[] };
  /**
   * The intended shape of the table, straight from the keyword sheet: one entry per sheet
   * column, in order, each with its keywords.
   *
   * Without it the grid infers grouping from the markets a keyword has rows in, which is only
   * right when a sweep is complete. On .org it produced one shapeless block — 59 of 98
   * keywords happened to return in exactly two markets, so they were filed under "Selected
   * markets" instead of the 20 cross-market + 20-per-country layout the sheet defines.
   *
   * It also lets one keyword appear in more than one block, which inference cannot express:
   * the sheet deliberately reuses a phrasing across country columns, and collapsing those into
   * a single row would hide it from every market but one.
   */
  groups?: { code: string; keywords: string[] }[];
}) {
  if (rows.length === 0 && !roster?.keywords.length && !groups?.length) {
    return <p className="text-sm text-slate-500">No ranking data for this week.</p>;
  }

  const countries = roster?.countries ?? [...new Map(rows.map((r) => [r.country, r.country_sort])).entries()]
    .sort((a, b) => a[1] - b[1]).map(([c]) => c);
  const keywords = roster?.keywords ?? [...new Map(rows.map((r) => [r.keyword, r.keyword_sort])).entries()]
    .sort((a, b) => a[1] - b[1]).map(([k]) => k);
  const byKey = new Map(rows.map((r) => [`${r.keyword}|${r.country}`, r]));

  const totalCols = 3 + countries.length * 2;
  const headBase = "bg-slate-50 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500";

  // Which markets a keyword targets: the page-wide picture when we have it, else this
  // week's rows. All-market keywords cover every country; country-specific ones exactly
  // one -> that's how we group + mute.
  const trackedIn = (kw: string) => {
    const declared = trackedMarkets?.get(kw);
    return declared ? countries.filter((c) => declared.includes(c)) : countries.filter((c) => byKey.has(`${kw}|${c}`));
  };
  const groupOf = (kw: string) => {
    const t = trackedIn(kw);
    return t.length === countries.length ? "ALL" : t.length === 1 ? t[0] : "MULTI";
  };
  const groupLabel = (g: string) =>
    g === "ALL" ? "🌐 All markets" : g === "MULTI" ? "Selected markets" : `${FLAG[g] ?? ""} ${marketLabel(g)}`.trim();

  // Walk group by group rather than in raw keyword order: a header is emitted when the
  // group changes, so interleaved groups would repeat the same header again and again
  // (and collide on their React keys). All markets first, then multi-market, then each
  // single market in column order; keyword_sort still orders rows inside a group.
  const groupRank = (g: string) => (g === "ALL" ? -2 : g === "MULTI" ? -1 : countries.indexOf(g));
  const keywordRank = new Map(keywords.map((k, i) => [k, i]));

  // One entry per row of the table. With `groups` the sheet decides the shape and a keyword
  // may appear under several blocks; without it the old inference applies and each keyword
  // appears exactly once.
  const entries: { group: string; keyword: string }[] = groups
    ? groups.flatMap((g) => g.keywords.map((keyword) => ({ group: g.code, keyword })))
    : [...keywords]
        .sort((a, b) => groupRank(groupOf(a)) - groupRank(groupOf(b)) || keywordRank.get(a)! - keywordRank.get(b)!)
        .map((keyword) => ({ group: groupOf(keyword), keyword }));

  // Which markets a row covers: from its block when the sheet defines one, else inferred.
  const marketsFor = (entry: { group: string; keyword: string }) =>
    groups ? (entry.group === "ALL" ? countries : [entry.group]) : trackedIn(entry.keyword);

  const body: React.ReactNode[] = [];
  let prevGroup: string | null = null;
  let parity = 0;
  for (const entry of entries) {
    const { keyword: kw, group: g } = entry;
    if (g !== prevGroup) {
      const count = entries.filter((e) => e.group === g).length;
      body.push(
        <tr key={`hdr-${g}`}>
          <td colSpan={totalCols} className="border-y border-slate-200 bg-slate-100/80 px-3 py-1.5 text-left text-xs font-semibold text-slate-700">
            {groupLabel(g)}
            <span className="font-normal text-slate-400"> · {count} keyword{count === 1 ? "" : "s"}</span>
          </td>
        </tr>,
      );
      prevGroup = g;
      parity = 0;
    }
    const zebra = parity++ % 2 === 1 ? "bg-slate-50/60" : "bg-white";
    const markets = marketsFor(entry);
    body.push(
      <tr key={`${g}|${kw}`} className={`border-b border-slate-100 transition-colors hover:bg-sky-50/60 ${zebra}`}>
        <td dir="ltr" className="max-w-[220px] border-r border-slate-200 px-3 py-2 text-left align-middle text-xs leading-snug text-slate-500">
          {keywordEnglish(kw)}
        </td>
        <td dir="rtl" className="max-w-[280px] border-r border-slate-100 px-3 py-2 align-middle font-medium leading-snug text-slate-800">
          {kw}
        </td>
        <td className="border-r border-slate-100 px-3 py-2 text-right align-middle tabular-nums text-xs text-slate-500">
          {formatVolume(globalVolume?.get(kw))}
        </td>
        {countries.map((c) => {
          const tracked = markets.includes(c);
          if (tracked && !byKey.has(`${kw}|${c}`)) {
            // Tracked here, but this week's sweep never returned a result for the pair.
            // Distinct from "not tracked" on purpose — one is how the grid is shaped,
            // the other is a hole in the data.
            return (
              <Fragment key={c}>
                <td
                  title="The rank checker didn't complete this keyword in this market — the next sweep fills it in"
                  className="border-l-2 border-slate-100 border-l-slate-200 px-3 py-2 text-center align-middle"
                >
                  {/* A bare dash here read as an empty cell, so it says what it is: the
                      check is missing, which is NOT the same as "not ranking". */}
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                    Not checked
                  </span>
                </td>
                <td className="px-3 py-2 text-center align-middle tabular-nums text-xs text-slate-400">
                  {formatVolume(marketVolume?.get(`${kw}|${c}`))}
                </td>
              </Fragment>
            );
          }
          if (!tracked) {
            // keyword isn't tracked in this market — mute it so the market it DOES target stands out
            return (
              <Fragment key={c}>
                <td title="Not tracked in this market" className="border-l-2 border-slate-100 border-l-slate-200 bg-slate-50/70 px-3 py-2 text-center align-middle text-slate-300">·</td>
                <td className="bg-slate-50/70 px-3 py-2 text-center align-middle text-slate-300"></td>
              </Fragment>
            );
          }
          const row = byKey.get(`${kw}|${c}`);
          return (
            <Fragment key={c}>
              <td className="border-l-2 border-slate-100 border-l-slate-200 px-3 py-2 text-center align-middle">
                <Cell position={row?.position ?? null} prev={row?.prev_position ?? null} />
              </td>
              <td className="px-3 py-2 text-center align-middle tabular-nums text-xs text-slate-400">
                {formatVolume(marketVolume?.get(`${kw}|${c}`))}
              </td>
            </Fragment>
          );
        })}
      </tr>,
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th rowSpan={2} className={`border-b border-r border-slate-200 text-left ${headBase}`}>English</th>
            <th rowSpan={2} className={`border-b border-r border-slate-200 text-right ${headBase}`}>Keyword</th>
            <th rowSpan={2} title="Global search volume" className={`border-b border-r border-slate-200 text-right ${headBase}`}>GSV</th>
            {countries.map((c) => (
              <th key={c} colSpan={2} className={`border-b border-l-2 border-slate-200 border-l-slate-300 text-center ${headBase}`}>
                {FLAG[c] ? `${FLAG[c]} ` : ""}{marketLabel(c)}
              </th>
            ))}
          </tr>
          <tr>
            {countries.map((c) => (
              <Fragment key={c}>
                <th className="border-b border-l-2 border-slate-200 border-l-slate-300 bg-slate-50 px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">Rank</th>
                <th title="Search volume" className="border-b border-slate-200 bg-slate-50 px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">SV</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </table>
    </div>
  );
}

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
}) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">No ranking data for this week.</p>;

  const countries = [...new Map(rows.map((r) => [r.country, r.country_sort])).entries()]
    .sort((a, b) => a[1] - b[1]).map(([c]) => c);
  const keywords = [...new Map(rows.map((r) => [r.keyword, r.keyword_sort])).entries()]
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
  const ordered = [...keywords].sort(
    (a, b) => groupRank(groupOf(a)) - groupRank(groupOf(b)) || keywordRank.get(a)! - keywordRank.get(b)!,
  );

  const body: React.ReactNode[] = [];
  let prevGroup: string | null = null;
  let parity = 0;
  for (const kw of ordered) {
    const g = groupOf(kw);
    if (g !== prevGroup) {
      const count = ordered.filter((k) => groupOf(k) === g).length;
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
    body.push(
      <tr key={kw} className={`border-b border-slate-100 transition-colors hover:bg-sky-50/60 ${zebra}`}>
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
          const tracked = trackedIn(kw).includes(c);
          if (tracked && !byKey.has(`${kw}|${c}`)) {
            // Tracked here, but this week's sweep never returned a result for the pair.
            // Distinct from "not tracked" on purpose — one is how the grid is shaped,
            // the other is a hole in the data.
            return (
              <Fragment key={c}>
                <td
                  title="No result this week — the rank checker didn't complete this keyword in this market"
                  className="border-l-2 border-slate-100 border-l-slate-200 px-3 py-2 text-center align-middle text-xs text-slate-400"
                >
                  –
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

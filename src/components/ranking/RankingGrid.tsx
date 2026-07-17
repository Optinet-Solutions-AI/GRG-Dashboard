import { Fragment } from "react";
import { rankCell } from "@/lib/ranking/rank-cell.mjs";
import { keywordEnglish } from "@/lib/ranking/keyword-labels";
import type { GridRow } from "@/lib/data/ranking";
import { formatVolume } from "@/lib/format";
import { marketLabel } from "@/lib/market-labels";

const FLAG: Record<string, string> = { AE: "🇦🇪", SA: "🇸🇦", QA: "🇶🇦", KW: "🇰🇼", BH: "🇧🇭", OM: "🇴🇲" };

function Cell({ position, prev }: { position: number | null; prev: number | null }) {
  const cell = rankCell(position, prev);
  if (!cell.ranked) {
    return <span className="text-xs text-slate-400">Not in top 100</span>;
  }
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="tabular-nums font-semibold text-slate-800">{cell.label}</span>
      {cell.dir === "up" && (
        <span className="text-xs font-semibold text-emerald-600">↑{cell.prev != null ? ` ${cell.prev}` : ""}</span>
      )}
      {cell.dir === "down" && (
        <span className="text-xs font-semibold text-rose-500">↓{cell.prev != null ? ` ${cell.prev}` : ""}</span>
      )}
      {cell.dir === "new" && <span className="text-xs font-semibold text-emerald-600">↑ new</span>}
    </span>
  );
}

export function RankingGrid({
  rows,
  globalVolume,
  marketVolume,
}: {
  rows: GridRow[];
  globalVolume?: Map<string, number>;
  marketVolume?: Map<string, number>;
}) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">No ranking data for this week.</p>;

  const countries = [...new Map(rows.map((r) => [r.country, r.country_sort])).entries()]
    .sort((a, b) => a[1] - b[1]).map(([c]) => c);
  const keywords = [...new Map(rows.map((r) => [r.keyword, r.keyword_sort])).entries()]
    .sort((a, b) => a[1] - b[1]).map(([k]) => k);
  const byKey = new Map(rows.map((r) => [`${r.keyword}|${r.country}`, r]));

  const totalCols = 3 + countries.length * 2;
  const headBase = "bg-slate-50 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500";

  // A keyword is tracked in a market only if it has a row there. All-market keywords have all
  // countries; country-specific ones have exactly one -> that's how we group + mute.
  const trackedIn = (kw: string) => countries.filter((c) => byKey.has(`${kw}|${c}`));
  const groupOf = (kw: string) => {
    const t = trackedIn(kw);
    return t.length === countries.length ? "ALL" : t.length === 1 ? t[0] : "MULTI";
  };
  const groupLabel = (g: string) =>
    g === "ALL" ? "🌐 All markets" : g === "MULTI" ? "Selected markets" : `${FLAG[g] ?? ""} ${marketLabel(g)}`.trim();

  const body: React.ReactNode[] = [];
  let prevGroup: string | null = null;
  let parity = 0;
  for (const kw of keywords) {
    const g = groupOf(kw);
    if (g !== prevGroup) {
      const count = keywords.filter((k) => groupOf(k) === g).length;
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
          const tracked = byKey.has(`${kw}|${c}`);
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

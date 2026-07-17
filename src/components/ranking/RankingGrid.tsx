import { Fragment } from "react";
import { rankCell } from "@/lib/ranking/rank-cell.mjs";
import { keywordEnglish } from "@/lib/ranking/keyword-labels";
import type { GridRow } from "@/lib/data/ranking";
import { formatVolume } from "@/lib/format";
import { marketLabel } from "@/lib/market-labels";

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

  const headBase = "bg-slate-50 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500";

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th rowSpan={2} className={`border-b border-r border-slate-200 text-left ${headBase}`}>
              English
            </th>
            <th rowSpan={2} className={`border-b border-r border-slate-200 text-right ${headBase}`}>
              Keyword
            </th>
            <th rowSpan={2} title="Global search volume" className={`border-b border-r border-slate-200 text-right ${headBase}`}>
              GSV
            </th>
            {countries.map((c) => (
              <th key={c} colSpan={2} className={`border-b border-l-2 border-slate-200 border-l-slate-300 text-center ${headBase}`}>
                {marketLabel(c)}
              </th>
            ))}
          </tr>
          <tr>
            {countries.map((c) => (
              <Fragment key={c}>
                <th className="border-b border-l-2 border-slate-200 border-l-slate-300 bg-slate-50 px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Rank
                </th>
                <th title="Search volume" className="border-b border-slate-200 bg-slate-50 px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  SV
                </th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {keywords.map((kw) => (
            <tr key={kw} className="border-b border-slate-100 transition-colors last:border-0 even:bg-slate-50/60 hover:bg-sky-50/50">
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

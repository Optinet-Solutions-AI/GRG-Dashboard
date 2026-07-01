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
      <span className="tabular-nums font-medium text-slate-800">{cell.label}</span>
      {cell.dir === "up" && (
        <span className="text-xs font-semibold text-green-600">↑{cell.prev != null ? ` (${cell.prev})` : ""}</span>
      )}
      {cell.dir === "down" && (
        <span className="text-xs font-semibold text-red-600">↓{cell.prev != null ? ` (${cell.prev})` : ""}</span>
      )}
      {cell.dir === "new" && <span className="text-xs font-semibold text-green-600">↑</span>}
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

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-300">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              English
            </th>
            <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Keyword
            </th>
            <th title="Global search volume" className="border border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
              GSV
            </th>
            {countries.map((c) => (
              <th key={c} className="border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                {marketLabel(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keywords.map((kw) => (
            <tr key={kw} className="even:bg-slate-50/40">
              <td dir="ltr" className="border border-slate-200 px-3 py-1.5 text-left text-xs text-slate-500">{keywordEnglish(kw)}</td>
              <td className="border border-slate-200 px-3 py-1.5 whitespace-nowrap text-slate-800">{kw}</td>
              <td className="border border-slate-200 px-3 py-1.5 text-right tabular-nums text-xs text-slate-600">
                {formatVolume(globalVolume?.get(kw))}
              </td>
              {countries.map((c) => {
                const row = byKey.get(`${kw}|${c}`);
                return (
                  <td key={c} className="border border-slate-200 px-3 py-1.5 text-center">
                    <Cell position={row?.position ?? null} prev={row?.prev_position ?? null} />
                    <div className="mt-0.5 text-[11px] tabular-nums text-slate-400">{formatVolume(marketVolume?.get(`${kw}|${c}`))}</div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

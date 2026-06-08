import { rankCell } from "@/lib/ranking/rank-cell.mjs";
import type { GridRow } from "@/lib/data/ranking";

const COLOR: Record<string, string> = {
  green: "bg-green-600 text-white",
  amber: "bg-amber-500 text-white",
  red: "bg-red-500/90 text-white",
};
const ARROW: Record<string, string> = { up: "▲", down: "▼", new: "NEW", none: "" };

export function RankingGrid({ rows }: { rows: GridRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">No ranking data for this week.</p>;

  const countries = [...new Map(rows.map((r) => [r.country, r.country_sort])).entries()]
    .sort((a, b) => a[1] - b[1]).map(([c]) => c);
  const keywords = [...new Map(rows.map((r) => [r.keyword, r.keyword_sort])).entries()]
    .sort((a, b) => a[1] - b[1]).map(([k]) => k);
  const byKey = new Map(rows.map((r) => [`${r.keyword}|${r.country}`, r]));

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="px-3 py-2 font-medium">Keyword</th>
            {countries.map((c) => (<th key={c} className="px-3 py-2 text-center font-medium">{c}</th>))}
          </tr>
        </thead>
        <tbody>
          {keywords.map((kw) => (
            <tr key={kw} className="border-b border-slate-100">
              <td className="px-3 py-2 font-medium text-slate-800">{kw}</td>
              {countries.map((c) => {
                const row = byKey.get(`${kw}|${c}`);
                const cell = rankCell(row?.position ?? null, row?.prev_position ?? null);
                const arrow = ARROW[cell.dir];
                return (
                  <td key={c} className="px-3 py-2 text-center">
                    <span className={`inline-flex min-w-[3.5rem] items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${COLOR[cell.color]}`}>
                      {cell.label}
                      {arrow ? <span className="opacity-90">{arrow}{cell.delta != null ? ` ${cell.delta}` : ""}</span> : null}
                    </span>
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

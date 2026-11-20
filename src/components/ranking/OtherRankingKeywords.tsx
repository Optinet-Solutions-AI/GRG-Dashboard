import { marketLabel } from "@/lib/market-labels";
import { formatVolume } from "@/lib/format";

const FLAG: Record<string, string> = { AE: "🇦🇪", SA: "🇸🇦", QA: "🇶🇦", KW: "🇰🇼", BH: "🇧🇭", OM: "🇴🇲" };

export type OtherKeyword = {
  keyword: string;
  countryCode: string;
  position: number;
  url: string;
  volume: number | null;
  isNew: boolean;
};

/**
 * Keywords Ahrefs sees this site ranking for that nobody tracks.
 *
 * Deliberately separate from the grid above rather than mixed into it: the grid is the agreed
 * keyword set, measured every week and reported to the client. This is a monthly look at what
 * the site earns besides — useful, but a different claim, and blending the two would make a
 * found keyword look like a tracked one.
 */
export function OtherRankingKeywords({ cycle, rows }: { cycle: string | null; rows: OtherKeyword[] }) {
  if (!cycle) return null;

  const asOf = new Date(`${cycle}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const newCount = rows.filter((r) => r.isNew).length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Also ranking — keywords we don&apos;t track</h2>
        <span className="text-xs text-slate-500">
          {rows.length} keyword{rows.length === 1 ? "" : "s"} · {asOf}
          {newCount ? ` · ${newCount} new` : ""}
        </span>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        What Ahrefs sees this site ranking for in the Gulf markets, beyond the keywords on the grid above.
        Checked monthly. A keyword disappears from here once it is added to tracking.
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing found outside the tracked keywords this month.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-2 py-1.5 font-semibold">Keyword</th>
                <th className="px-2 py-1.5 font-semibold">Market</th>
                <th className="px-2 py-1.5 text-right font-semibold">Position</th>
                <th className="px-2 py-1.5 text-right font-semibold">Searches</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.keyword}|${r.countryCode}`} className="border-b border-slate-100 last:border-0">
                  <td className="px-2 py-1.5">
                    {/* dir="auto" so an Arabic phrase reads right-to-left and a Latin one doesn't. */}
                    <span dir="auto" className="text-slate-700">{r.keyword}</span>
                    {r.isNew ? (
                      <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                        NEW
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-slate-600">
                    {FLAG[r.countryCode] ?? ""} {marketLabel(r.countryCode)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-slate-800">{r.position}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">
                    {r.volume == null ? "—" : formatVolume(r.volume)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { marketLabel } from "@/lib/market-labels";

export type RankingCheck = {
  week_date: string;
  keywords_checked: number;
  pairs_checked: number;
  pairs_ranked: number;
  markets: string[];
};

/**
 * What the rank checker actually looked at, for a site whose grid is empty.
 *
 * Only keywords that earn a place get a ranking row — the permanent set, plus new keywords
 * that reach the top 100. So a site that was checked and ranked nowhere stores zero rows and
 * looks exactly like a site nobody has ever checked. The first OpenSEO run for .org did that:
 * 50 keywords across two markets, none in the top 100, and the page said "No ranking data yet".
 *
 * This says which of the two actually happened.
 */
export function CheckSummary({ check }: { check: RankingCheck }) {
  const markets = check.markets.length
    ? check.markets.map((m) => marketLabel(m)).join(", ")
    : "no markets recorded";
  const none = check.pairs_ranked === 0;

  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="text-sm font-medium text-slate-700">
        {none ? "Checked — nothing in the top 100 yet." : "Checked — only some keywords rank so far."}
      </p>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
        On {check.week_date} the rank checker ran{" "}
        <span className="font-medium text-slate-700">{check.keywords_checked}</span> keyword
        {check.keywords_checked === 1 ? "" : "s"} across {markets} —{" "}
        <span className="font-medium text-slate-700">{check.pairs_checked}</span> keyword/market pair
        {check.pairs_checked === 1 ? "" : "s"} in all.{" "}
        {none ? (
          <>None reached the top 100, so there is nothing to chart yet.</>
        ) : (
          <>
            <span className="font-medium text-slate-700">{check.pairs_ranked}</span> reached the top 100.
          </>
        )}
      </p>
      <p className="mx-auto mt-2 max-w-xl text-xs text-slate-400">
        Keywords are added to the grid once they rank, so this fills in on its own as positions appear.
        An empty grid here means the site was checked, not that tracking is broken.
      </p>
    </div>
  );
}

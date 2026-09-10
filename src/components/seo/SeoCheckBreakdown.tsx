// The per-check detail behind a computed SEO score.
//
// A bare number nobody can explain is worse than no number: this is what makes "91/100"
// answerable ("which four things cost the nine points?") and lets a drop be traced to the
// exact test that changed.

export type StoredCheck = {
  id: string;
  group: string;
  label: string;
  status: "passed" | "warning" | "failed" | "not-applicable";
  weight: number;
  detail: string;
};

export type StoredAnalysis = {
  url?: string;
  analyzedAt?: string;
  score?: number;
  earned?: number;
  possible?: number;
  checks?: StoredCheck[];
};

const PILL: Record<StoredCheck["status"], string> = {
  passed: "bg-green-50 text-green-700 ring-green-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  failed: "bg-red-50 text-red-700 ring-red-200",
  "not-applicable": "bg-slate-50 text-slate-500 ring-slate-200",
};
const MARK: Record<StoredCheck["status"], string> = {
  passed: "Passed",
  warning: "Warning",
  failed: "Failed",
  "not-applicable": "n/a",
};

export function SeoCheckBreakdown({ analysis }: { analysis: StoredAnalysis | null }) {
  const checks = analysis?.checks ?? [];
  if (!checks.length) return null;

  const groups = [...new Set(checks.map((c) => c.group))];
  const needsWork = checks.filter((c) => c.status === "warning" || c.status === "failed");

  return (
    <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">
        What made this score
        <span className="ml-2 font-normal text-slate-500">
          {needsWork.length === 0
            ? `all ${checks.length} tests clean`
            : `${needsWork.length} of ${checks.length} tests need work`}
        </span>
      </summary>

      {analysis?.url ? (
        <p className="mt-2 text-xs text-slate-500">
          {analysis.url}
          {analysis.earned != null && analysis.possible != null ? ` · ${analysis.earned}/${analysis.possible} weighted points` : ""}
          {analysis.analyzedAt ? ` · fetched ${new Date(analysis.analyzedAt).toISOString().slice(0, 16).replace("T", " ")} UTC` : ""}
        </p>
      ) : null}

      <div className="mt-3 space-y-3">
        {groups.map((group) => (
          <div key={group}>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group}</h4>
            <ul className="mt-1 space-y-1">
              {checks
                .filter((c) => c.group === group)
                // Anything actionable first: a reader wants the failures, not the passes.
                .sort((a, b) => {
                  const rank = { failed: 0, warning: 1, passed: 2, "not-applicable": 3 } as const;
                  return rank[a.status] - rank[b.status];
                })
                .map((c) => (
                  <li key={c.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ring-1 ${PILL[c.status]}`}>{MARK[c.status]}</span>
                    <span className="font-medium text-slate-700">{c.label}</span>
                    <span className="text-xs text-slate-500">{c.detail}</span>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}

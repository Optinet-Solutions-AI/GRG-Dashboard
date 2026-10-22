import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveSiteId } from "@/lib/sites";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { StatCard } from "@/components/StatCard";
import { SyncBacklinksButton } from "@/components/sections/SyncBacklinksButton";
import { BacklinksTable } from "@/components/backlinks/BacklinksTable";
import { tallyByKeyword } from "@/lib/backlinks/keyword-tally";
import { trackedKeywordSet, filterToTrackedKeywords, type TargetRow } from "@/lib/backlinks/tracked-keywords";
import Link from "next/link";

type Row = {
  id: string; date: string;
  source_site: string | null; source_url: string | null; anchor_text: string | null; target_url: string | null;
  indexed: string | null; status: string | null; remarks: string | null;
  sites: { display_name: string };
};

/**
 * The sheet carries TWO columns that can disagree: `status` ("Indexed" / "Not Indexed" /
 * "Submitted") and a free-text `indexed` note ("Indexed by Google" or blank). Counting the
 * card from one and the "By status" list from the other made the page contradict itself —
 * 103 in the card beside 104 in the list, because one row's status said Indexed while its
 * indexed cell was left blank.
 *
 * `status` is the single source of truth here: it is the column the breakdown shows and
 * the one that is always filled in. Rows where the note disagrees are surfaced separately
 * rather than silently changing the total.
 */
function isIndexed(v: string | null): boolean {
  return (v ?? "").trim().toLowerCase() === "indexed";
}

function hasIndexedNote(v: string | null): boolean {
  const t = (v ?? "").trim();
  return t.length > 0 && !/^(no|not)/i.test(t);
}

function tally<T>(items: T[], key: (t: T) => string | null): { label: string; count: number }[] {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

export default async function BacklinksPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; keywords?: string }>;
}) {
  const { site, keywords } = await searchParams;
  const trackedOnly = keywords === "tracked";
  const supabase = await createServerSupabaseClient();
  const isAdmin = isAdminRole(await getCurrentRole());
  const { data: siteList } = await supabase.from("sites").select("id").order("sort_order");
  const siteId = resolveSiteId(siteList, site);

  let q = supabase
    .from("backlinks")
    .select("id, date, source_site, source_url, anchor_text, target_url, indexed, status, remarks, sites!inner(display_name)")
    .order("date", { ascending: false })
    .limit(1000);
  if (siteId) q = q.eq("site_id", siteId);
  const { data } = await q;
  const allRows = (data ?? []) as unknown as Row[];

  // This site's rank-tracking roster, to tell links built for a keyword we measure from the
  // long tail. Both counts are worked out either way, so the control can show them without
  // the reader having to click to find out.
  const { data: targetRows } = siteId
    ? await supabase.from("keyword_targets").select("keywords(text)").eq("site_id", siteId)
    : { data: [] };
  const roster = trackedKeywordSet((targetRows ?? []) as unknown as TargetRow[]);
  const trackedRows = filterToTrackedKeywords(allRows, roster);
  const rows = trackedOnly ? trackedRows : allRows;

  // ---- Analytics ----
  const total = rows.length;
  const indexedCount = rows.filter((r) => isIndexed(r.status)).length;
  // Rows the two columns disagree about — a data-entry gap in the sheet, worth showing
  // rather than letting it move a headline number.
  const noteMismatch = rows.filter((r) => isIndexed(r.status) !== hasIndexedNote(r.indexed)).length;
  const sources = new Set(rows.map((r) => r.source_site).filter(Boolean));
  const byStatus = tally(rows, (r) => r.status);
  const byDate = tally(rows, (r) => r.date).sort((a, b) => b.label.localeCompare(a.label)); // newest first
  const topSources = tally(rows, (r) => r.source_site).slice(0, 8);
  const byKeyword = tallyByKeyword(rows);
  const topTargets = tally(rows, (r) => (r.target_url ? r.target_url.replace(/^https?:\/\//, "") : null)).slice(0, 8);
  // Taken from the dates themselves, not from byDate's order: it used to read the last
  // element of a chronological list, so flipping that list to newest-first would have
  // quietly turned the "Latest batch" card into the OLDEST batch.
  const latest = rows.length ? [...rows.map((r) => r.date)].sort().at(-1)! : "—";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Backlinks</h1>
        {isAdmin ? <SyncBacklinksButton /> : null}
      </div>
      <p className="text-xs text-slate-500">Synced from the Google Sheet (auto-refreshes daily; admins can sync on demand).</p>

      {/* A link rather than client state, so the choice survives a refresh and can be shared,
          and so the whole page is rendered against one set of rows. Both counts are on the
          control: .net has 497 links and none on its tracked keywords, which is worth seeing
          without having to click to discover it. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {([
            ["all", "All keywords", allRows.length],
            ["tracked", "Tracked keywords only", trackedRows.length],
          ] as const).map(([key, label, count]) => {
            const on = (key === "tracked") === trackedOnly;
            const p = new URLSearchParams();
            if (site) p.set("site", site);
            if (key === "tracked") p.set("keywords", "tracked");
            const qs = p.toString();
            return (
              <Link
                key={key}
                href={qs ? `/backlinks?${qs}` : "/backlinks"}
                aria-current={on ? "page" : undefined}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                  on ? "bg-slate-800 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                    on ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {count}
                </span>
              </Link>
            );
          })}
        </div>
        {trackedOnly ? (
          <p className="text-xs text-slate-500">
            Only links whose keyword is one of the {roster.size} this site is rank-tracked for.
          </p>
        ) : null}
      </div>

      {trackedOnly && trackedRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-4">
          <p className="text-sm font-medium text-amber-900">
            None of this site&apos;s {allRows.length} backlinks were built for one of its tracked keywords.
          </p>
          <p className="mt-1 text-sm text-amber-800">
            {roster.size === 0
              ? "No rank-tracking keywords are set for this site yet, so there is nothing to match against."
              : "The links use different wording from the keyword sheet. Either the link building is aimed somewhere other than the tracked set, or the two are written differently and need reconciling."}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total backlinks" value={String(total)} />
        <StatCard
          label="Indexed"
          value={total ? `${indexedCount} (${Math.round((indexedCount / total) * 100)}%)` : "—"}
          sub={noteMismatch ? `${noteMismatch} row${noteMismatch === 1 ? "" : "s"}: sheet's "indexed" note disagrees with status` : undefined}
        />
        <StatCard label="Source domains" value={String(sources.size)} />
        <StatCard label="Latest batch" value={latest} />
      </div>

      {total > 0 && (
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 text-sm font-semibold text-slate-900">By status</div>
            {byStatus.length ? byStatus.map((s) => (
              <div key={s.label} className="flex justify-between py-0.5 text-sm"><span className="text-slate-600">{s.label}</span><span className="font-semibold text-slate-800">{s.count}</span></div>
            )) : <p className="text-sm text-slate-400">—</p>}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 text-sm font-semibold text-slate-900">Built per date</div>
            <div className="max-h-40 space-y-0.5 overflow-y-auto">
              {byDate.map((d) => (
                <div key={d.label} className="flex justify-between py-0.5 text-sm"><span className="text-slate-600">{d.label}</span><span className="font-semibold text-slate-800">{d.count}</span></div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 text-sm font-semibold text-slate-900">Top source domains</div>
            {topSources.map((s) => (
              <div key={s.label} className="flex justify-between py-0.5 text-sm"><span className="truncate text-slate-600">{s.label}</span><span className="ml-2 font-semibold text-slate-800">{s.count}</span></div>
            ))}
          </div>
        </div>
      )}

      {byKeyword.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <div className="text-sm font-semibold text-slate-900">Backlinks per keyword</div>
            <div className="text-xs text-slate-500">
              {byKeyword.length} keyword{byKeyword.length === 1 ? "" : "s"}
            </div>
          </div>
          {/* Full width and two columns rather than a quarter of the row beside the panels
              above: the keywords are Arabic phrases, and in a narrow column every one of them
              truncates to the same opening words. */}
          <div className="max-h-72 overflow-y-auto pr-1 md:columns-2 md:gap-6">
            {byKeyword.map((k) => (
              <div key={k.label} className="flex items-baseline justify-between gap-3 break-inside-avoid py-0.5 text-sm">
                {/* dir="auto" so an Arabic phrase reads right-to-left and a Latin one doesn't. */}
                <span dir="auto" className="min-w-0 text-slate-600">{k.label}</span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-800">{k.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Click a column header to sort (date, status, keyword…).</p>
        {/* Keyed on the unfiltered count: with the tracked filter on, an empty table means the
            filter excluded everything, not that nothing has been synced. */}
        {allRows.length === 0 && isAdmin ? <p className="text-xs text-slate-500">No backlinks yet — click “Sync from Google Sheet”.</p> : null}
      </div>
      <BacklinksTable
        rows={rows.map((r) => ({
          id: r.id, date: r.date, source_site: r.source_site, source_url: r.source_url,
          anchor_text: r.anchor_text, target_url: r.target_url, indexed: r.indexed, status: r.status,
        }))}
      />
    </div>
  );
}

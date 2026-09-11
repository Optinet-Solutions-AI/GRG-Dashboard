import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveSiteId } from "@/lib/sites";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { StatCard } from "@/components/StatCard";
import { SyncBacklinksButton } from "@/components/sections/SyncBacklinksButton";
import { BacklinksTable } from "@/components/backlinks/BacklinksTable";

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

export default async function BacklinksPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const { site } = await searchParams;
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
  const rows = (data ?? []) as unknown as Row[];

  // ---- Analytics ----
  const total = rows.length;
  const indexedCount = rows.filter((r) => isIndexed(r.status)).length;
  // Rows the two columns disagree about — a data-entry gap in the sheet, worth showing
  // rather than letting it move a headline number.
  const noteMismatch = rows.filter((r) => isIndexed(r.status) !== hasIndexedNote(r.indexed)).length;
  const sources = new Set(rows.map((r) => r.source_site).filter(Boolean));
  const byStatus = tally(rows, (r) => r.status);
  const byDate = tally(rows, (r) => r.date).sort((a, b) => a.label.localeCompare(b.label)); // chronological
  const topSources = tally(rows, (r) => r.source_site).slice(0, 8);
  const topTargets = tally(rows, (r) => (r.target_url ? r.target_url.replace(/^https?:\/\//, "") : null)).slice(0, 8);
  const latest = byDate.at(-1)?.label ?? "—";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Backlinks</h1>
        {isAdmin ? <SyncBacklinksButton /> : null}
      </div>
      <p className="text-xs text-slate-500">Synced from the Google Sheet (auto-refreshes daily; admins can sync on demand).</p>

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

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Click a column header to sort (date, status, keyword…).</p>
        {rows.length === 0 && isAdmin ? <p className="text-xs text-slate-500">No backlinks yet — click “Sync from Google Sheet”.</p> : null}
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

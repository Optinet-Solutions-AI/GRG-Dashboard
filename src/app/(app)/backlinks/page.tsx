import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { addBacklink, deleteBacklink, addBacklinkSummary, deleteBacklinkSummary } from "./actions";
import { AddBacklink } from "@/components/sections/AddBacklink";
import { AddBacklinkSummary } from "@/components/sections/AddBacklinkSummary";
import { SummaryPeriodFilter } from "@/components/sections/SummaryPeriodFilter";

export default async function BacklinksPage({ searchParams }: { searchParams: Promise<{ site?: string; bl_month?: string; bl_date?: string }> }) {
  const { site, bl_month, bl_date } = await searchParams;
  const supabase = await createServerSupabaseClient();

  const isAdmin = isAdminRole(await getCurrentRole());
  const { data: siteList } = await supabase.from("sites").select("id, display_name").order("sort_order");
  const today = new Date();
  const defaultDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Distinct summary periods (dates), newest first → derive the month/date filter state.
  const { data: pdata } = await supabase
    .from("backlink_summary")
    .select("period_date")
    .order("period_date", { ascending: false });
  const allDates = [...new Set(((pdata ?? []) as { period_date: string }[]).map((p) => p.period_date))];
  const allMonths = [...new Set(allDates.map((d) => d.slice(0, 7)))];
  let activeDate = "";
  if (bl_date && allDates.includes(bl_date)) activeDate = bl_date;
  else if (bl_month) activeDate = allDates.find((d) => d.startsWith(bl_month)) ?? allDates[0] ?? "";
  else activeDate = allDates[0] ?? "";
  const activeMonth = activeDate ? activeDate.slice(0, 7) : (allMonths[0] ?? "");

  let q = supabase
    .from("backlinks")
    .select("id, date, source_site, source_url, anchor_text, target_url, sites!inner(display_name)")
    .order("date", { ascending: false })
    .limit(500);
  if (site) q = q.eq("site_id", site);
  const { data } = await q;
  const rows = (data ?? []) as unknown as Array<{
    id: string; date: string; source_site: string | null; source_url: string | null; anchor_text: string | null; target_url: string | null; sites: { display_name: string };
  }>;

  // Per-site summary (No. backlinks by sub-page)
  let sq = supabase
    .from("backlink_summary")
    .select("id, sub_url, backlink_count, site_id, sites!inner(display_name, sort_order)")
    .order("sort_order", { ascending: true });
  if (site) sq = sq.eq("site_id", site);
  if (activeDate) sq = sq.eq("period_date", activeDate);
  const { data: sdata } = await sq;
  const summaryRows = (sdata ?? []) as unknown as Array<{
    id: string; sub_url: string; backlink_count: number; site_id: string; sites: { display_name: string; sort_order: number };
  }>;
  const summaryBySite = new Map<string, { name: string; sortOrder: number; rows: typeof summaryRows }>();
  for (const r of summaryRows) {
    const g = summaryBySite.get(r.site_id) ?? { name: r.sites.display_name, sortOrder: r.sites.sort_order, rows: [] };
    g.rows.push(r);
    summaryBySite.set(r.site_id, g);
  }
  const summaryGroups = [...summaryBySite.values()].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold">Backlinks summary</h1>
          <div className="flex flex-wrap items-center gap-3">
            {allDates.length ? <SummaryPeriodFilter months={allMonths} dates={allDates} activeMonth={activeMonth} activeDate={activeDate} /> : null}
            {isAdmin ? <AddBacklinkSummary sites={(siteList ?? [])} defaultSite={site ?? (siteList?.[0]?.id ?? "")} defaultDate={defaultDate} action={addBacklinkSummary} /> : null}
          </div>
        </div>
        {summaryGroups.length === 0 ? <p className="text-sm text-slate-500">No backlink summary yet.</p> : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {summaryGroups.map((g) => {
              const total = g.rows.reduce((a, r) => a + r.backlink_count, 0);
              return (
                <div key={g.name} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-2 font-semibold text-slate-900">{g.name}</div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500"><th className="py-1 font-medium">Sub-page</th><th className="py-1 text-right font-medium">No. Backlinks</th>{isAdmin ? <th></th> : null}</tr>
                    </thead>
                    <tbody>
                      {g.rows.map((r) => (
                        <tr key={r.id} className="border-t border-slate-100">
                          <td className="py-1.5 text-slate-700">{r.sub_url.replace(/^https?:\/\//, "")}</td>
                          <td className="py-1.5 text-right font-semibold text-slate-800">{r.backlink_count}</td>
                          {isAdmin ? <td className="py-1.5 text-right"><form action={deleteBacklinkSummary.bind(null, r.id)}><button className="text-xs text-red-600 hover:underline">✕</button></form></td> : null}
                        </tr>
                      ))}
                      <tr className="border-t-2 border-slate-200"><td className="py-1.5 font-semibold text-slate-900">Total</td><td className="py-1.5 text-right font-bold text-slate-900">{total}</td>{isAdmin ? <td></td> : null}</tr>
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <h1 className="text-xl font-bold">Backlinks <span className="text-sm font-normal text-slate-500">({rows.length})</span></h1>
      {isAdmin ? <AddBacklink sites={(siteList ?? [])} defaultSite={site ?? (siteList?.[0]?.id ?? "")} defaultDate={defaultDate} action={addBacklink} /> : null}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Site</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Anchor</th>
              <th className="px-3 py-2 font-medium">Target</th>
              {isAdmin ? <th className="px-3 py-2 font-medium">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-100 align-top">
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.date}</td>
                <td className="px-3 py-2 text-slate-600">{r.sites.display_name}</td>
                <td className="px-3 py-2">
                  {r.source_url ? <a href={r.source_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{r.source_site ?? r.source_url}</a> : (r.source_site ?? "—")}
                </td>
                <td className="px-3 py-2 text-slate-700">{r.anchor_text ?? "—"}</td>
                <td className="px-3 py-2">
                  {r.target_url ? <a href={r.target_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{r.target_url}</a> : "—"}
                </td>
                {isAdmin ? (
                  <td className="px-3 py-2">
                    <form action={deleteBacklink.bind(null, r.id)}>
                      <button className="text-red-600 hover:underline">Delete</button>
                    </form>
                  </td>
                ) : null}
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={isAdmin ? 6 : 5} className="px-3 py-3 text-slate-500">No backlinks.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

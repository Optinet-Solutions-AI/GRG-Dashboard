import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveSiteId } from "@/lib/sites";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { signScreenshots } from "@/lib/storage";
import { updateHealthPeriod, addHealthPeriod, deleteHealthPeriod } from "./actions";
import { EditEntryForm } from "@/components/entry/EditEntryForm";
import { HEALTH_FIELDS } from "@/lib/entries/entry-fields";
import { AddHealthPeriod } from "@/components/sections/AddHealthPeriod";

const METRICS = [
  ["domain_rating", "Domain Rating"],
  ["referring_domains", "Referring Domains"],
  ["total_visitors", "Total Visitors"],
  ["organic_traffic", "Organic Traffic"],
  ["organic_keywords", "Organic Keywords"],
] as const;

export default async function HealthPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const { site } = await searchParams;
  const supabase = await createServerSupabaseClient();
  const isAdmin = isAdminRole(await getCurrentRole());

  const { data: siteList } = await supabase.from("sites").select("id, display_name").order("sort_order");
  const siteId = resolveSiteId(siteList, site);
  const selectedSite = (siteList ?? []).find((s) => s.id === siteId);
  const today = new Date();
  const defaultDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  let q = supabase
    .from("health_snapshots")
    .select("id, date, domain_rating, referring_domains, total_visitors, organic_traffic, organic_keywords, screenshot_path, site_id, sites!inner(display_name, sort_order)")
    .order("date", { ascending: false });
  if (siteId) q = q.eq("site_id", siteId);
  const { data } = await q;
  const rows = (data ?? []) as unknown as Array<Record<string, unknown> & { id: string; date: string; screenshot_path: string | null; sites: { display_name: string } }>;

  const signed = await signScreenshots(rows.map((r) => r.screenshot_path));

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Health Score (Ahrefs)</h1>
      {isAdmin && selectedSite ? (
        <AddHealthPeriod defaultDate={defaultDate} action={addHealthPeriod.bind(null, selectedSite.id)} />
      ) : null}
      {rows.map((r) => (
        <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-semibold text-slate-900">{r.sites.display_name}</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">{r.date}</span>
              {isAdmin ? (
                <EditEntryForm
                  fields={HEALTH_FIELDS}
                  initial={r}
                  action={updateHealthPeriod.bind(null, r.id)}
                  deleteAction={deleteHealthPeriod.bind(null, r.id)}
                  screenshotLabel="Replace Ahrefs screenshot (optional)"
                />
              ) : null}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              {/* Read-only for everyone; admins edit via the Edit button in the header. */}
              <dl className="grid grid-cols-2 gap-2 text-sm">
                  {METRICS.map(([key, label]) => (
                    <div key={key} className="flex justify-between rounded-md bg-slate-50 px-3 py-2">
                      <dt className="text-slate-500">{label}</dt>
                      <dd className="font-semibold text-slate-800">{(r[key] as number | null) ?? "—"}</dd>
                    </div>
                  ))}
              </dl>
            </div>
            <div>
              {r.screenshot_path && signed.get(r.screenshot_path) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signed.get(r.screenshot_path)} alt={`Ahrefs overview for ${r.sites.display_name}`} className="w-full rounded-lg border border-slate-200" />
              ) : <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">No screenshot</div>}
            </div>
          </div>
        </div>
      ))}
      {rows.length === 0 ? <p className="text-sm text-slate-500">No health data.</p> : null}
    </div>
  );
}

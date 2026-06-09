import { createServerSupabaseClient } from "@/lib/supabase/server";
import { signScreenshots } from "@/lib/storage";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { addPagespeedPeriod } from "./actions";
import { AddPagespeedPeriod } from "@/components/entry/AddPagespeedPeriod";
import { PsiAutofillButton } from "@/components/sources/PsiAutofillButton";

// PSI runs Lighthouse for mobile + desktop (~30-60s); give the serverless function room.
export const maxDuration = 60;

function NumChip({ n }: { n: number | null }) {
  const color = n == null ? "bg-slate-200 text-slate-600" : n >= 90 ? "bg-green-600 text-white" : n >= 50 ? "bg-amber-500 text-white" : "bg-red-500 text-white";
  return <span className={`inline-flex min-w-[2rem] items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold ${color}`}>{n ?? "—"}</span>;
}

export default async function PageSpeedPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const { site } = await searchParams;
  const supabase = await createServerSupabaseClient();
  let q = supabase
    .from("pagespeed_entries")
    .select("id, mobile_score, desktop_score, mobile_screenshot_path, desktop_screenshot_path, pagespeed_urls!inner(url, site_id, sites!inner(display_name))")
    .order("date", { ascending: false });
  if (site) q = q.eq("pagespeed_urls.site_id", site);
  const { data } = await q;
  const rows = (data ?? []) as unknown as Array<{
    id: string; mobile_score: number | null; desktop_score: number | null;
    mobile_screenshot_path: string | null; desktop_screenshot_path: string | null;
    pagespeed_urls: { url: string; sites: { display_name: string } };
  }>;

  const signed = await signScreenshots(rows.flatMap((r) => [r.mobile_screenshot_path, r.desktop_screenshot_path]));

  const isAdmin = isAdminRole(await getCurrentRole());
  let entry = null;
  if (isAdmin) {
    const { data: purls } = await supabase.from("pagespeed_urls").select("id, url, label, sites!inner(domain)").order("sort_order");
    const { data: latestPs } = await supabase.from("pagespeed_entries").select("pagespeed_url_id, mobile_score, desktop_score, date").order("date", { ascending: false });
    const latestByUrl = new Map<string, { mobile_score: number | null; desktop_score: number | null }>();
    for (const r of (latestPs ?? []) as Array<{ pagespeed_url_id: string; mobile_score: number | null; desktop_score: number | null }>) {
      if (!latestByUrl.has(r.pagespeed_url_id)) latestByUrl.set(r.pagespeed_url_id, r);
    }
    const purlRows = (purls ?? []) as unknown as Array<{ id: string; url: string; label: string | null; sites: { domain: string } }>;
    const urlRows = purlRows.map((u) => {
      const v = latestByUrl.get(u.id);
      return { id: u.id, url: u.url, host: u.sites.domain, mobile: v?.mobile_score ?? null, desktop: v?.desktop_score ?? null };
    });
    const psiUrls = purlRows.map((u) => ({ id: u.id, url: u.url, label: u.label }));
    const today = new Date();
    const defaultDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    entry = (
      <>
        <PsiAutofillButton urls={psiUrls} />
        <AddPagespeedPeriod urls={urlRows} defaultDate={defaultDate} action={addPagespeedPeriod} />
      </>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">PageSpeed</h1>
      {entry}
      {rows.map((r) => (
        <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-2">
            <a href={r.pagespeed_urls.url} target="_blank" rel="noreferrer" className="font-semibold text-slate-900 hover:underline">{r.pagespeed_urls.url}</a>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {([["Mobile", r.mobile_screenshot_path, r.mobile_score], ["Desktop", r.desktop_screenshot_path, r.desktop_score]] as const).map(([label, path, score]) => (
              <div key={label}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs font-medium uppercase text-slate-500">{label} report</span>
                  <NumChip n={score} />
                </div>
                {path && signed.get(path) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={signed.get(path)} alt={`${label} PageSpeed report`} className="w-full rounded-lg border border-slate-200" />
                ) : <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">No screenshot</div>}
              </div>
            ))}
          </div>
        </div>
      ))}
      {rows.length === 0 ? <p className="text-sm text-slate-500">No PageSpeed data.</p> : null}
    </div>
  );
}

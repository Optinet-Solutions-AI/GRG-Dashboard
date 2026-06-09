import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { addPagespeedPeriod } from "./actions";
import { AddPagespeedPeriod } from "@/components/entry/AddPagespeedPeriod";
import { PsiAutofillButton } from "@/components/sources/PsiAutofillButton";

// PSI runs Lighthouse for mobile + desktop (~30-60s); give the serverless function room.
export const maxDuration = 60;

function gaugeColor(n: number | null): string {
  if (n == null) return "#cbd5e1";
  return n >= 90 ? "#16a34a" : n >= 50 ? "#f59e0b" : "#dc2626";
}

function Gauge({ label, score }: { label: string; score: number | null }) {
  const v = score ?? 0;
  const color = gaugeColor(score);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-14 w-14 rounded-full" style={{ background: `conic-gradient(${color} ${v * 3.6}deg, #e2e8f0 0deg)` }}>
        <div className="absolute inset-[3px] flex items-center justify-center rounded-full bg-white text-sm font-bold" style={{ color }}>
          {score ?? "—"}
        </div>
      </div>
      <span className="text-center text-[10px] uppercase leading-tight tracking-wide text-slate-500">{label}</span>
    </div>
  );
}

function DeviceReport({
  label, perf, a11y, bp, seo,
}: { label: string; perf: number | null; a11y: number | null; bp: number | null; seo: number | null }) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{label} report</div>
      <div className="flex flex-wrap gap-3 sm:gap-5">
        <Gauge label="Performance" score={perf} />
        <Gauge label="Accessibility" score={a11y} />
        <Gauge label="Best Practices" score={bp} />
        <Gauge label="SEO" score={seo} />
      </div>
    </div>
  );
}

type Row = {
  id: string;
  date: string;
  mobile_score: number | null; mobile_accessibility: number | null; mobile_best_practices: number | null; mobile_seo: number | null;
  desktop_score: number | null; desktop_accessibility: number | null; desktop_best_practices: number | null; desktop_seo: number | null;
  pagespeed_urls: { url: string; sites: { display_name: string } };
};

export default async function PageSpeedPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const { site } = await searchParams;
  const supabase = await createServerSupabaseClient();
  let q = supabase
    .from("pagespeed_entries")
    .select("id, date, mobile_score, mobile_accessibility, mobile_best_practices, mobile_seo, desktop_score, desktop_accessibility, desktop_best_practices, desktop_seo, pagespeed_urls!inner(url, site_id, sites!inner(display_name))")
    .order("date", { ascending: false });
  if (site) q = q.eq("pagespeed_urls.site_id", site);
  const { data } = await q;
  const rows = (data ?? []) as unknown as Row[];

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
      <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">Update PageSpeed (admin)</summary>
        <p className="mt-2 text-xs text-slate-500">Auto-fill pulls all four scores from Google PageSpeed Insights. Auto-refreshes every 15 days.</p>
        <div className="mt-3 space-y-3">
          <PsiAutofillButton urls={psiUrls} />
          <AddPagespeedPeriod urls={urlRows} defaultDate={defaultDate} action={addPagespeedPeriod} />
        </div>
      </details>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">PageSpeed</h1>
      {entry}
      {rows.map((r) => (
        <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <a href={r.pagespeed_urls.url} target="_blank" rel="noreferrer" className="font-semibold text-slate-900 hover:underline">{r.pagespeed_urls.url}</a>
            <span className="text-xs text-slate-500">{r.date}</span>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <DeviceReport label="Mobile" perf={r.mobile_score} a11y={r.mobile_accessibility} bp={r.mobile_best_practices} seo={r.mobile_seo} />
            <DeviceReport label="Desktop" perf={r.desktop_score} a11y={r.desktop_accessibility} bp={r.desktop_best_practices} seo={r.desktop_seo} />
          </div>
        </div>
      ))}
      {rows.length === 0 ? <p className="text-sm text-slate-500">No PageSpeed data.</p> : null}
    </div>
  );
}

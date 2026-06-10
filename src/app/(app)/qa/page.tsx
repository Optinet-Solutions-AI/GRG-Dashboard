import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { SITE_COL_ORDER, SITE_FIELD_LABELS } from "@/lib/qa/parse-qa-sheet";
import { SyncQaButton } from "@/components/qa/SyncQaButton";
import { QaSiteChecklist } from "@/components/qa/QaSiteChecklist";
import { QaPageTable } from "@/components/qa/QaPageTable";


type PageRow = Record<string, string | number | null>;
type SiteRow = Record<string, string | number | null>;

export default async function QaPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const { site } = await searchParams;
  const supabase = await createServerSupabaseClient();
  const isAdmin = isAdminRole(await getCurrentRole());

  const { data: siteList } = await supabase.from("sites").select("id, display_name").order("sort_order");
  const activeSite = (siteList ?? []).find((s) => s.id === site) ?? (siteList ?? [])[0];

  let pageRows: PageRow[] = [];
  let siteRow: SiteRow | null = null;
  let syncedAt: string | null = null;

  if (activeSite) {
    const [{ data: pr }, { data: sr }] = await Promise.all([
      supabase
        .from("qa_page_audit")
        .select("*")
        .eq("site_id", activeSite.id)
        .order("sheet_row", { ascending: true }),
      supabase
        .from("qa_site_audit")
        .select("*")
        .eq("site_id", activeSite.id)
        .single(),
    ]);
    pageRows = (pr ?? []) as PageRow[];
    siteRow = sr as SiteRow | null;
    syncedAt = siteRow?.synced_at as string | null;
  }

  // These fields have dedicated dashboard pages (Health, SEO Score, PageSpeed).
  const HIDDEN_FIELDS = new Set(["website", "page_seo_score", "rankmath_seo_analyzer", "ahrefs_health_issue", "pagespeed_desktop", "pagespeed_mobile"]);

  const siteChecklistItems = SITE_COL_ORDER
    .filter((field) => !HIDDEN_FIELDS.has(field))
    .map((field) => ({
      field,
      label: SITE_FIELD_LABELS[field] ?? field,
      value: (siteRow?.[field] as string) ?? "",
    }));

  const noData = !siteRow && pageRows.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">
            QA Audit {activeSite ? <span className="text-base font-normal text-slate-500">— {activeSite.display_name}</span> : null}
          </h1>
          {syncedAt ? (
            <p className="mt-0.5 text-xs text-slate-400">Last synced: {new Date(syncedAt).toLocaleString()}</p>
          ) : null}
        </div>
        {isAdmin && activeSite ? <SyncQaButton siteId={activeSite.id} /> : null}
      </div>

      {noData ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No QA data yet.{isAdmin ? ' Click "Sync from Google Sheet" to load.' : " Ask the admin to sync."}
        </div>
      ) : null}

      {/* Whole-Site Health */}
      {(siteRow || isAdmin) ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
            Whole-Site Health
            <span className="ml-2 text-xs font-normal text-slate-400">
              ({siteChecklistItems.filter((i) => i.value?.toLowerCase() === "done").length}/{siteChecklistItems.length} done)
            </span>
          </h2>
          {siteRow ? (
            <QaSiteChecklist
              siteId={activeSite!.id}
              items={siteChecklistItems}
              isAdmin={isAdmin}
            />
          ) : (
            <p className="text-xs text-slate-400">No whole-site data — sync to load.</p>
          )}
          {isAdmin ? (
            <p className="mt-3 text-xs text-slate-400">
              {process.env.GOOGLE_SHEETS_SA_KEY
                ? "Edits sync back to Google Sheet automatically."
                : "Set GOOGLE_SHEETS_SA_KEY env var to enable automatic write-back to the Google Sheet."}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Per-Page Audit */}
      {pageRows.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              Per-Page Audit
              <span className="ml-2 text-xs font-normal text-slate-400">({pageRows.length} pages)</span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">Click a row to expand full details.</p>
          </div>
          <QaPageTable rows={pageRows} />
        </section>
      ) : null}
    </div>
  );
}

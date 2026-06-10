import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { SITE_COL_ORDER, SITE_FIELD_LABELS } from "@/lib/qa/parse-qa-sheet";
import { SyncQaButton } from "@/components/qa/SyncQaButton";
import { QaSiteChecklist } from "@/components/qa/QaSiteChecklist";

// Column labels for the per-page audit table (26 cols)
const PAGE_COL_LABELS: { key: string; label: string }[] = [
  { key: "group_name", label: "Group" },
  { key: "url", label: "URL" },
  { key: "indexed_gsc", label: "Indexed GSC" },
  { key: "en_equivalent", label: "EN Equiv." },
  { key: "permalink", label: "Permalink" },
  { key: "status", label: "Status" },
  { key: "lang", label: "Lang" },
  { key: "dir", label: "Dir" },
  { key: "title", label: "Title" },
  { key: "title_length", label: "Title Len" },
  { key: "meta_description", label: "Meta Desc" },
  { key: "meta_length", label: "Meta Len" },
  { key: "canonical", label: "Canonical" },
  { key: "h1_count", label: "H1 #" },
  { key: "h1", label: "H1" },
  { key: "h2_count", label: "H2 #" },
  { key: "h2_list", label: "H2 List" },
  { key: "h3_count", label: "H3 #" },
  { key: "h3_list", label: "H3 List" },
  { key: "images_total", label: "Imgs" },
  { key: "images_with_alt", label: "With Alt" },
  { key: "images_decorative", label: "Decorative" },
  { key: "images_missing_alt", label: "Missing Alt" },
  { key: "missing_alt_srcs", label: "Missing Alt Srcs" },
  { key: "seo_issues", label: "SEO Issues" },
  { key: "ar_alignment_issues", label: "AR Issues" },
];

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

  const siteChecklistItems = SITE_COL_ORDER.map((field) => ({
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
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[60rem] text-xs">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="border-b border-slate-200">
                  {PAGE_COL_LABELS.map((col) => (
                    <th
                      key={col.key}
                      className="whitespace-nowrap px-2.5 py-2 text-left font-medium text-slate-500"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, i) => (
                  <tr
                    key={String(row.id ?? i)}
                    className="border-b border-slate-100 hover:bg-slate-50/60"
                  >
                    {PAGE_COL_LABELS.map((col) => {
                      const val = String(row[col.key] ?? "");
                      const isUrl = col.key === "url" && val.startsWith("http");
                      return (
                        <td
                          key={col.key}
                          className="max-w-[14rem] truncate px-2.5 py-1.5 align-top"
                          title={val || undefined}
                        >
                          {isUrl ? (
                            <a href={val} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                              {val}
                            </a>
                          ) : (
                            <span className={val ? "text-slate-700" : "text-slate-300"}>
                              {val || "—"}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

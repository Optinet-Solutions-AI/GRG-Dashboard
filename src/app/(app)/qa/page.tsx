import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { saveQaChecks } from "./actions";
import { QaEditor } from "@/components/sections/QaEditor";
import { RefreshQaPagesButton } from "@/components/sections/RefreshQaPagesButton";

function pageLabel(url: string, label: string | null): string {
  if (label) return label;
  try { return decodeURIComponent(new URL(url).pathname) || "/"; } catch { return url; }
}

export default async function QaPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const { site } = await searchParams;
  const supabase = await createServerSupabaseClient();

  const isAdmin = isAdminRole(await getCurrentRole());
  const { data: siteList } = await supabase.from("sites").select("id, display_name").order("sort_order");
  const editSite = (siteList ?? []).find((s) => s.id === site) ?? (siteList ?? [])[0];

  if (isAdmin && editSite) {
    const [{ data: pages }, { data: els }, { data: checks }] = await Promise.all([
      supabase.from("qa_pages").select("id, url, label, sort_order").eq("site_id", editSite.id).order("sort_order"),
      supabase.from("qa_elements").select("id, name, sort_order").order("sort_order"),
      supabase.from("qa_checks").select("qa_page_id, qa_element_id, passed, qa_pages!inner(site_id)").eq("qa_pages.site_id", editSite.id),
    ]);
    const checked: Record<string, boolean> = {};
    for (const c of (checks ?? []) as Array<{ qa_page_id: string; qa_element_id: string; passed: boolean }>) {
      if (c.passed) checked[`${c.qa_page_id}|${c.qa_element_id}`] = true;
    }
    const pageRows = ((pages ?? []) as Array<{ id: string; url: string; label: string | null }>).map((p) => ({ id: p.id, url: pageLabel(p.url, p.label) }));
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold">QA Checklist — {editSite.display_name} <span className="text-sm font-normal text-slate-500">({pageRows.length} pages)</span></h1>
          <RefreshQaPagesButton siteId={editSite.id} />
        </div>
        <p className="text-xs text-slate-500">Tick the elements that are present/correct on each page, then Save. “Refresh pages from sitemap” pulls every page on the site.</p>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <QaEditor
            pages={pageRows}
            elements={(els ?? []) as { id: string; name: string }[]}
            checked={checked}
            action={saveQaChecks.bind(null, editSite.id)}
          />
        </div>
      </div>
    );
  }

  // Source pages from qa_pages (ALL crawled pages), not from qa_checks — so every
  // page shows even before its checklist has been filled in.
  const viewSite = (siteList ?? []).find((s) => s.id === site) ?? (siteList ?? [])[0];
  const [{ data: pageRows }, { data: elements }, { data: checkRows }] = await Promise.all([
    viewSite
      ? supabase.from("qa_pages").select("id, url, label, sort_order").eq("site_id", viewSite.id).order("sort_order")
      : Promise.resolve({ data: [] as Array<{ id: string; url: string; label: string | null; sort_order: number }> }),
    supabase.from("qa_elements").select("id, name").order("sort_order"),
    viewSite
      ? supabase.from("qa_checks").select("qa_page_id, qa_element_id, passed, qa_pages!inner(site_id)").eq("qa_pages.site_id", viewSite.id)
      : Promise.resolve({ data: [] as Array<{ qa_page_id: string; qa_element_id: string; passed: boolean }> }),
  ]);

  const elementList = (elements ?? []) as Array<{ id: string; name: string }>;
  const pages = ((pageRows ?? []) as Array<{ id: string; url: string; label: string | null }>).map((p) => ({
    id: p.id,
    url: p.url,
    display: pageLabel(p.url, p.label),
  }));
  const byCell = new Map<string, boolean>();
  for (const c of (checkRows ?? []) as Array<{ qa_page_id: string; qa_element_id: string; passed: boolean }>) {
    byCell.set(`${c.qa_page_id}|${c.qa_element_id}`, c.passed);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">
        QA Checklist {viewSite ? <span className="text-base font-normal text-slate-500">— {viewSite.display_name}</span> : null}
        <span className="ml-1 text-sm font-normal text-slate-500">({pages.length} pages)</span>
      </h1>
      <p className="text-xs text-slate-500">Brand-protection elements per page. ✓ = present · ✗ = missing · – = not yet checked.</p>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-3 py-2 font-medium">Page</th>
              {elementList.map((e) => (<th key={e.id} className="px-3 py-2 text-center font-medium">{e.name}</th>))}
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                <td className="max-w-[24rem] truncate px-3 py-2">
                  <a href={p.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline" title={p.url}>{p.display}</a>
                </td>
                {elementList.map((e) => {
                  const passed = byCell.get(`${p.id}|${e.id}`);
                  return (
                    <td key={e.id} className="px-3 py-2 text-center">
                      {passed === undefined ? <span className="text-slate-300">–</span>
                        : passed ? <span className="font-semibold text-green-600">✓</span>
                        : <span className="font-semibold text-red-600">✗</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            {pages.length === 0 ? <tr><td className="px-3 py-3 text-slate-500" colSpan={elementList.length + 1}>No pages yet — an admin can “Refresh pages from sitemap”.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

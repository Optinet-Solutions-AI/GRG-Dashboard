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
        <div className="max-h-[72vh] overflow-y-auto rounded-lg border border-slate-200">
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

  const { data: elements } = await supabase.from("qa_elements").select("name").order("sort_order");
  const elementNames = (elements ?? []).map((e: { name: string }) => e.name);

  let q = supabase
    .from("qa_checks")
    .select("passed, qa_pages!inner(url, label, site_id, sort_order, sites!inner(display_name)), qa_elements!inner(name)");
  if (site) q = q.eq("qa_pages.site_id", site);
  const { data } = await q;

  type Row = { passed: boolean; qa_pages: { url: string; label: string | null; sort_order: number; sites: { display_name: string } }; qa_elements: { name: string } };
  const checks = (data ?? []) as unknown as Row[];

  const pages = [...new Map(checks.map((c) => [c.qa_pages.url, c.qa_pages])).entries()]
    .sort((a, b) => a[1].sort_order - b[1].sort_order)
    .map(([url, p]) => ({ url, display: pageLabel(p.url, p.label) }));
  const byCell = new Map(checks.map((c) => [`${c.qa_pages.url}|${c.qa_elements.name}`, c.passed]));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">QA Checklist <span className="text-sm font-normal text-slate-500">({pages.length} pages)</span></h1>
      <p className="text-xs text-slate-500">Brand-protection elements per page. ✓ = present/correct.</p>
      <div className="max-h-[72vh] overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-3 py-2 font-medium">Page</th>
              {elementNames.map((n) => (<th key={n} className="px-3 py-2 text-center font-medium">{n}</th>))}
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <tr key={p.url} className="border-b border-slate-100">
                <td className="max-w-[24rem] truncate px-3 py-2 text-slate-700">{p.display}</td>
                {elementNames.map((n) => {
                  const passed = byCell.get(`${p.url}|${n}`);
                  return (
                    <td key={n} className="px-3 py-2 text-center">
                      {passed === undefined ? <span className="text-slate-300">–</span>
                        : passed ? <span className="font-semibold text-green-600">✓</span>
                        : <span className="font-semibold text-red-600">✗</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            {pages.length === 0 ? <tr><td className="px-3 py-3 text-slate-500">No QA data yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

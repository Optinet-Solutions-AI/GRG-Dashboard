import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { saveQaChecks } from "./actions";
import { QaEditor } from "@/components/sections/QaEditor";

export default async function QaPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const { site } = await searchParams;
  const supabase = await createServerSupabaseClient();

  const isAdmin = isAdminRole(await getCurrentRole());
  // resolve a site to edit: the ?site filter, else first site
  const { data: siteList } = await supabase.from("sites").select("id, display_name").order("sort_order");
  const editSite = (siteList ?? []).find((s) => s.id === site) ?? (siteList ?? [])[0];

  if (isAdmin && editSite) {
    const [{ data: pages }, { data: els }, { data: checks }] = await Promise.all([
      supabase.from("qa_pages").select("id, url, sort_order").eq("site_id", editSite.id).order("sort_order"),
      supabase.from("qa_elements").select("id, name, sort_order").order("sort_order"),
      supabase.from("qa_checks").select("qa_page_id, qa_element_id, passed, qa_pages!inner(site_id)").eq("qa_pages.site_id", editSite.id),
    ]);
    const checked: Record<string, boolean> = {};
    for (const c of (checks ?? []) as Array<{ qa_page_id: string; qa_element_id: string; passed: boolean }>) {
      if (c.passed) checked[`${c.qa_page_id}|${c.qa_element_id}`] = true;
    }
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">QA Checklist — {editSite.display_name}</h1>
        <p className="text-xs text-slate-500">Tick the elements that are present/correct on each page, then Save. Newly added QA pages appear here automatically.</p>
        <QaEditor
          pages={(pages ?? []) as { id: string; url: string }[]}
          elements={(els ?? []) as { id: string; name: string }[]}
          checked={checked}
          action={saveQaChecks.bind(null, editSite.id)}
        />
      </div>
    );
  }

  const { data: elements } = await supabase.from("qa_elements").select("name").order("sort_order");
  const elementNames = (elements ?? []).map((e: { name: string }) => e.name);

  let q = supabase
    .from("qa_checks")
    .select("passed, qa_pages!inner(url, site_id, sort_order, sites!inner(display_name)), qa_elements!inner(name)");
  if (site) q = q.eq("qa_pages.site_id", site);
  const { data } = await q;

  type Row = { passed: boolean; qa_pages: { url: string; sort_order: number; sites: { display_name: string } }; qa_elements: { name: string } };
  const checks = (data ?? []) as unknown as Row[];

  const pages = [...new Map(checks.map((c) => [c.qa_pages.url, c.qa_pages])).entries()]
    .sort((a, b) => a[1].sort_order - b[1].sort_order).map(([url, p]) => ({ url, site: p.sites.display_name }));
  const byCell = new Map(checks.map((c) => [`${c.qa_pages.url}|${c.qa_elements.name}`, c.passed]));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">QA Checklist</h1>
      <p className="text-xs text-slate-500">Brand-protection elements per page. ✓ = present/correct.</p>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-3 py-2 font-medium">Page</th>
              {elementNames.map((n) => (<th key={n} className="px-3 py-2 text-center font-medium">{n}</th>))}
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <tr key={p.url} className="border-b border-slate-100">
                <td className="px-3 py-2 text-slate-700">{p.url}</td>
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
            {pages.length === 0 ? <tr><td className="px-3 py-3 text-slate-500">No QA data.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

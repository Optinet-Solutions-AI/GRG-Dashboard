"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

type Site = { id: string; display_name: string };

export function SiteSelector({ sites }: { sites: Site[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("site") ?? "";

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(params.toString());
    if (e.target.value) next.set("site", e.target.value);
    else next.delete("site");
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <>
      <label className="sr-only" htmlFor="site-select">Site</label>
      <select id="site-select" value={current} onChange={onChange}
        className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-white">
        <option value="">All sites</option>
        {sites.map((s) => (<option key={s.id} value={s.id}>{s.display_name}</option>))}
      </select>
    </>
  );
}

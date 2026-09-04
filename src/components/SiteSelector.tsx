"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

type Site = { id: string; display_name: string };

export function SiteSelector({ sites }: { sites: Site[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // No "all sites" entry: the dashboard always shows one site, and an unscoped URL
  // renders the first one (see lib/sites.ts), so that is what the box must show.
  const requested = params.get("site") ?? "";
  const current = sites.some((s) => s.id === requested) ? requested : (sites[0]?.id ?? "");

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(params.toString());
    next.set("site", e.target.value);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <>
      <label className="sr-only" htmlFor="site-select">Site</label>
      <select id="site-select" value={current} onChange={onChange}
        className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-white">
        {sites.map((s) => (<option key={s.id} value={s.id}>{s.display_name}</option>))}
      </select>
    </>
  );
}

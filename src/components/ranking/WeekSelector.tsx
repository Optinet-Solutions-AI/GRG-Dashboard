"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

export function WeekSelector({ weeks, current }: { weeks: string[]; current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(params.toString());
    next.set("week", e.target.value);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="week-select" className="text-sm text-slate-600">Week</label>
      <select id="week-select" value={current} onChange={onChange}
        className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
        {weeks.map((w) => (<option key={w} value={w}>{w}</option>))}
      </select>
    </div>
  );
}

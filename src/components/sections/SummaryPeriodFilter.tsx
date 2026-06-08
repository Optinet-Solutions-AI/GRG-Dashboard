"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return `${MONTHS[parseInt(m, 10) - 1]} ${y}`;
}

export function SummaryPeriodFilter({
  months, dates, activeMonth, activeDate,
}: {
  months: string[]; dates: string[]; activeMonth: string; activeDate: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function go(next: URLSearchParams) {
    router.push(`${pathname}?${next.toString()}`);
  }
  function onMonth(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(params.toString());
    next.set("bl_month", e.target.value);
    next.delete("bl_date"); // let the page pick the latest date in that month
    go(next);
  }
  function onDate(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(params.toString());
    next.set("bl_date", e.target.value);
    go(next);
  }

  const datesInMonth = dates.filter((d) => d.startsWith(activeMonth));

  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor="bl-month" className="text-slate-600">Month</label>
      <select id="bl-month" value={activeMonth} onChange={onMonth} className="rounded-md border border-slate-300 bg-white px-2 py-1.5">
        {months.map((m) => (<option key={m} value={m}>{monthLabel(m)}</option>))}
      </select>
      <label htmlFor="bl-date" className="ml-2 text-slate-600">Date</label>
      <select id="bl-date" value={activeDate} onChange={onDate} className="rounded-md border border-slate-300 bg-white px-2 py-1.5">
        {datesInMonth.map((d) => (<option key={d} value={d}>{d}</option>))}
      </select>
    </div>
  );
}

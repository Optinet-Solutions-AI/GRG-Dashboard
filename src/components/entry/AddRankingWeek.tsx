"use client";

import { useActionState, useState } from "react";

type Kw = { id: string; text: string };
type Country = { id: string; code: string };
type State = { error?: string } | undefined;

export function AddRankingWeek({
  keywords, countries, prefill, defaultDate, action,
}: {
  keywords: Kw[];
  countries: Country[];
  prefill: Record<string, number | null>; // key `${kwId}|${countryId}`
  defaultDate: string;
  action: (prev: State, formData: FormData) => Promise<State>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, undefined);
  if (!open) {
    return <button onClick={() => setOpen(true)} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">+ Add new week</button>;
  }
  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <label htmlFor="week_date" className="text-sm text-slate-600">New week date</label>
        <input id="week_date" name="week_date" type="date" defaultValue={defaultDate} required
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        <span className="text-xs text-slate-500">Pre-filled from the latest week — edit only what moved. Blank = not in top 100.</span>
      </div>
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead><tr className="text-slate-500"><th className="px-2 py-1 text-left">Keyword</th>{countries.map((c) => <th key={c.id} className="px-2 py-1">{c.code}</th>)}</tr></thead>
          <tbody>
            {keywords.map((k) => (
              <tr key={k.id}>
                <td className="px-2 py-1 font-medium text-slate-700">{k.text}</td>
                {countries.map((c) => {
                  const v = prefill[`${k.id}|${c.id}`];
                  return <td key={c.id} className="px-1 py-1">
                    <input name={`pos__${k.id}__${c.id}`} defaultValue={v ?? ""} inputMode="numeric"
                      className="w-16 rounded border border-slate-300 px-1.5 py-1 text-center" placeholder="—" />
                  </td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">{pending ? "Saving…" : "Save week"}</button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-500 hover:underline">Cancel</button>
        {state?.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
      </div>
    </form>
  );
}

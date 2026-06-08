"use client";

import { useActionState, useState } from "react";

type SiteRow = { id: string; display_name: string; rankmath: number | null; homepage: number | null; health: number | null };
type State = { error?: string } | undefined;

export function AddSeoPeriod({ sites, defaultDate, action }: {
  sites: SiteRow[]; defaultDate: string; action: (prev: State, formData: FormData) => Promise<State>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, undefined);
  if (!open) return <button onClick={() => setOpen(true)} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">+ Add new period</button>;
  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <label htmlFor="date" className="text-sm text-slate-600">Date</label>
        <input id="date" name="date" type="date" defaultValue={defaultDate} required className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        <span className="text-xs text-slate-500">Pre-filled from the latest period.</span>
      </div>
      <table className="text-sm">
        <thead><tr className="text-slate-500"><th className="px-2 py-1 text-left">Site</th><th className="px-2 py-1">Rankmath</th><th className="px-2 py-1">Homepage</th><th className="px-2 py-1">Health</th></tr></thead>
        <tbody>
          {sites.map((s) => (
            <tr key={s.id}>
              <td className="px-2 py-1 font-medium text-slate-700">{s.display_name}</td>
              {(["rankmath", "homepage", "health"] as const).map((f) => (
                <td key={f} className="px-1 py-1">
                  <input name={`${f}__${s.id}`} defaultValue={s[f] ?? ""} inputMode="numeric" className="w-16 rounded border border-slate-300 px-1.5 py-1 text-center" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">{pending ? "Saving…" : "Save period"}</button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-500 hover:underline">Cancel</button>
        {state?.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
      </div>
    </form>
  );
}

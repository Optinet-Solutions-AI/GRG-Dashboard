"use client";

import { useActionState, useState } from "react";

type Site = { id: string; display_name: string };
type State = { error?: string } | undefined;

export function AddBacklinkSummary({ sites, defaultSite, defaultDate, action }: {
  sites: Site[]; defaultSite: string; defaultDate: string; action: (prev: State, formData: FormData) => Promise<State>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, undefined);
  if (!open) return <button onClick={() => setOpen(true)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">+ Add sub-page count</button>;
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
      <label className="flex flex-col">Period (date)<input name="period_date" type="date" defaultValue={defaultDate} className="mt-1 rounded-md border border-slate-300 px-2 py-1.5" /></label>
      <label className="flex flex-col">Site
        <select name="site_id" defaultValue={defaultSite} className="mt-1 rounded-md border border-slate-300 px-2 py-1.5">
          {sites.map((s) => (<option key={s.id} value={s.id}>{s.display_name}</option>))}
        </select>
      </label>
      <label className="flex flex-col">Sub-page URL<input name="sub_url" placeholder="https://…" className="mt-1 w-64 rounded-md border border-slate-300 px-2 py-1.5" /></label>
      <label className="flex flex-col">No. Backlinks<input name="backlink_count" type="number" defaultValue="0" className="mt-1 w-24 rounded-md border border-slate-300 px-2 py-1.5" /></label>
      <button type="submit" disabled={pending} className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white disabled:opacity-50">{pending ? "Saving…" : "Save"}</button>
      <button type="button" onClick={() => setOpen(false)} className="text-slate-500 hover:underline">Cancel</button>
      {state?.error ? <span className="w-full text-red-600">{state.error}</span> : null}
    </form>
  );
}

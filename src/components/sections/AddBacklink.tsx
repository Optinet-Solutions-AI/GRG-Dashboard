"use client";

import { useActionState, useState } from "react";

type Site = { id: string; display_name: string };
type State = { error?: string } | undefined;

export function AddBacklink({ sites, defaultSite, defaultDate, action }: {
  sites: Site[]; defaultSite: string; defaultDate: string; action: (prev: State, formData: FormData) => Promise<State>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, undefined);
  if (!open) return <button onClick={() => setOpen(true)} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">+ Add backlink</button>;
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <label className="flex flex-col">Site
        <select name="site_id" defaultValue={defaultSite} className="mt-1 rounded-md border border-slate-300 px-2 py-1.5">
          {sites.map((s) => (<option key={s.id} value={s.id}>{s.display_name}</option>))}
        </select>
      </label>
      <label className="flex flex-col">Date<input name="date" type="date" defaultValue={defaultDate} className="mt-1 rounded-md border border-slate-300 px-2 py-1.5" /></label>
      <label className="flex flex-col">Source site<input name="source_site" className="mt-1 rounded-md border border-slate-300 px-2 py-1.5" /></label>
      <label className="flex flex-col">Source URL<input name="source_url" className="mt-1 w-56 rounded-md border border-slate-300 px-2 py-1.5" /></label>
      <label className="flex flex-col">Anchor<input name="anchor_text" className="mt-1 rounded-md border border-slate-300 px-2 py-1.5" /></label>
      <label className="flex flex-col">Target URL<input name="target_url" className="mt-1 w-56 rounded-md border border-slate-300 px-2 py-1.5" /></label>
      <button type="submit" disabled={pending} className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white disabled:opacity-50">{pending ? "Adding…" : "Add"}</button>
      <button type="button" onClick={() => setOpen(false)} className="text-slate-500 hover:underline">Cancel</button>
      {state?.error ? <span className="w-full text-red-600">{state.error}</span> : null}
    </form>
  );
}

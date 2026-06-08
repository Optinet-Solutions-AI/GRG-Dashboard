"use client";

import { useActionState, useState } from "react";
import { ScreenshotInput } from "@/components/ScreenshotInput";

type UrlRow = { id: string; url: string; host: string; mobile: number | null; desktop: number | null };
type State = { error?: string } | undefined;

export function AddPagespeedPeriod({ urls, defaultDate, action }: {
  urls: UrlRow[]; defaultDate: string; action: (prev: State, formData: FormData) => Promise<State>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, undefined);
  if (!open) return <button onClick={() => setOpen(true)} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">+ Add new period</button>;
  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <label htmlFor="date" className="text-sm text-slate-600">Date</label>
        <input id="date" name="date" type="date" defaultValue={defaultDate} required className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        <span className="text-xs text-slate-500">Scores pre-filled from the latest period. Screenshots optional.</span>
      </div>
      <div className="space-y-3">
        {urls.map((u) => (
          <div key={u.id} className="rounded-lg border border-slate-200 p-3">
            <input type="hidden" name={`host__${u.id}`} value={u.host} />
            <div className="mb-2 text-sm font-medium text-slate-700">{u.url}</div>
            <div className="flex flex-wrap items-end gap-3 text-sm">
              <label className="flex flex-col">Mobile<input name={`mobile__${u.id}`} defaultValue={u.mobile ?? ""} inputMode="numeric" className="mt-1 w-20 rounded border border-slate-300 px-1.5 py-1 text-center" /></label>
              <label className="flex flex-col">Desktop<input name={`desktop__${u.id}`} defaultValue={u.desktop ?? ""} inputMode="numeric" className="mt-1 w-20 rounded border border-slate-300 px-1.5 py-1 text-center" /></label>
              <ScreenshotInput name={`mobileShot__${u.id}`} label="Mobile report" />
              <ScreenshotInput name={`desktopShot__${u.id}`} label="Desktop report" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">{pending ? "Saving…" : "Save period"}</button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-500 hover:underline">Cancel</button>
        {state?.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
      </div>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { ScreenshotInput } from "@/components/ScreenshotInput";

const METRICS = [
  ["domain_rating", "Domain Rating"],
  ["referring_domains", "Referring Domains"],
  ["total_visitors", "Total Visitors"],
  ["organic_traffic", "Organic Traffic"],
  ["organic_keywords", "Organic Keywords"],
] as const;

type State = { error?: string } | undefined;

export function AddHealthPeriod({
  defaultDate,
  action,
}: {
  defaultDate: string;
  action: (prev: State, formData: FormData) => Promise<State>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">+ Add health snapshot (Ahrefs)</summary>
      <p className="mt-2 text-xs text-slate-500">
        Numbers are optional — you can upload just the Ahrefs overview screenshot. Saving the same date again updates that period.
      </p>
      <form action={formAction} className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
        <label className="flex flex-col text-xs text-slate-600">
          Date
          <input name="date" type="date" defaultValue={defaultDate}
            className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900" />
        </label>
        {METRICS.map(([key, label]) => (
          <label key={key} className="flex flex-col text-xs text-slate-600">
            {label}
            <input name={key} type="number"
              className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900" />
          </label>
        ))}
        <div className="col-span-2 md:col-span-3">
          <ScreenshotInput name="screenshot" label="Ahrefs overview screenshot" />
        </div>
        <div className="col-span-2 flex items-center gap-3 md:col-span-3">
          <button type="submit" disabled={pending}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {pending ? "Saving…" : "Save health snapshot"}
          </button>
          {state?.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
        </div>
      </form>
    </details>
  );
}

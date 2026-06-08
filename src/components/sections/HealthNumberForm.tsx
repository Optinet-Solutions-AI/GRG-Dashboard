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

export function HealthNumberForm({
  initial,
  action,
}: {
  id: string;
  initial: Record<string, unknown>;
  action: (prev: State, formData: FormData) => Promise<State>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="grid grid-cols-2 gap-2">
      {METRICS.map(([key, label]) => (
        <label key={key} className="flex flex-col text-xs text-slate-600">
          {label}
          <input name={key} type="number" defaultValue={(initial[key] as number | null) ?? ""}
            className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900" />
        </label>
      ))}
      <div className="col-span-2 mt-1">
        <ScreenshotInput name="screenshot" label="Replace Ahrefs screenshot (optional)" />
      </div>
      <div className="col-span-2 mt-1 flex items-center gap-3">
        <button type="submit" disabled={pending}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "Saving…" : "Save numbers"}
        </button>
        {state?.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
      </div>
    </form>
  );
}

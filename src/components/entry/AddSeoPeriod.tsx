"use client";

import { useActionState } from "react";
import { ScreenshotInput } from "@/components/ScreenshotInput";

type State = { error?: string } | undefined;

export function AddSeoPeriod({
  defaultDate,
  action,
}: {
  defaultDate: string;
  action: (prev: State, formData: FormData) => Promise<State>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">+ Add SEO period (Rankmath analyzer)</summary>
      <p className="mt-2 text-xs text-slate-500">
        Enter the Rankmath SEO Analyzer numbers and upload its screenshot. Re-saving the same date updates that period.
      </p>
      <form action={formAction} className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        <label className="flex flex-col text-xs text-slate-600">
          Date
          <input name="date" type="date" defaultValue={defaultDate}
            className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900" />
        </label>
        <label className="flex flex-col text-xs text-slate-600">
          SEO Score (/100)
          <input name="seo_score" type="number" min={0} max={100}
            className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900" />
        </label>
        <label className="flex flex-col text-xs text-slate-600">
          Passed
          <input name="passed_tests" type="number"
            className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900" />
        </label>
        <label className="flex flex-col text-xs text-slate-600">
          Warnings
          <input name="warnings" type="number"
            className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900" />
        </label>
        <label className="flex flex-col text-xs text-slate-600">
          Failed
          <input name="failed_tests" type="number"
            className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900" />
        </label>
        <div className="col-span-2 md:col-span-5">
          <ScreenshotInput name="screenshot" label="Rankmath SEO Analyzer screenshot" />
        </div>
        <div className="col-span-2 flex items-center gap-3 md:col-span-5">
          <button type="submit" disabled={pending}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {pending ? "Saving…" : "Save SEO period"}
          </button>
          {state?.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
        </div>
      </form>
    </details>
  );
}

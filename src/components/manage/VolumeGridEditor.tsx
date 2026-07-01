"use client";

import { useActionState } from "react";

type State = { error?: string; success?: boolean } | undefined;

const MARKET_LABELS: Record<string, string> = { AE: "UAE" };
const marketLabel = (code: string) => MARKET_LABELS[code] ?? code;

export function VolumeGridEditor({
  keywords, countries, globalPrefill, cellPrefill, action,
}: {
  keywords: { id: string; text: string }[];
  countries: { id: string; code: string }[];
  globalPrefill: Record<string, number | null>;
  cellPrefill: Record<string, number | null>;
  action: (prev: State, fd: FormData) => Promise<State>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  const numCell =
    "w-20 rounded border border-slate-300 px-1.5 py-1 text-right tabular-nums";

  return (
    <form action={formAction} className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-slate-300">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Keyword</th>
              <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">GSV (global)</th>
              {countries.map((c) => (
                <th key={c.id} className="border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">{marketLabel(c.code)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keywords.map((k) => (
              <tr key={k.id} className="even:bg-slate-50/40">
                <td className="border border-slate-200 px-3 py-1.5 whitespace-nowrap text-slate-800">{k.text}</td>
                <td className="border border-slate-200 px-2 py-1.5 text-right">
                  <input name={`g:${k.id}`} defaultValue={globalPrefill[k.id] ?? ""} inputMode="numeric" placeholder="—" className={numCell} />
                </td>
                {countries.map((c) => (
                  <td key={c.id} className="border border-slate-200 px-2 py-1.5 text-center">
                    <input name={`v:${k.id}:${c.id}`} defaultValue={cellPrefill[`${k.id}|${c.id}`] ?? ""} inputMode="numeric" placeholder="—" className={numCell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "Saving…" : "Save volumes"}
        </button>
        {state?.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
        {state?.success ? <span className="text-sm text-green-600">Saved.</span> : null}
      </div>
    </form>
  );
}

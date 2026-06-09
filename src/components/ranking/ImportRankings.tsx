"use client";

import { useActionState } from "react";
import { importRankings } from "@/app/(app)/ranking/import-actions";

export function ImportRankings({ siteId }: { siteId: string }) {
  const [state, action, pending] = useActionState(importRankings, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <input type="hidden" name="site_id" value={siteId} />
      <span className="text-sm font-medium text-slate-700">Import Ahrefs export (CSV):</span>
      <input
        type="file"
        name="file"
        accept=".csv,text/csv,text/plain"
        required
        className="text-sm file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Importing…" : "Import"}
      </button>
      {state?.message ? <span className="text-sm text-green-700">{state.message}</span> : null}
      {state?.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
    </form>
  );
}

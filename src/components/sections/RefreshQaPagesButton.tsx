"use client";

import { useActionState } from "react";
import { refreshQaPages } from "@/app/(app)/qa/actions";

export function RefreshQaPagesButton({ siteId }: { siteId: string }) {
  const [state, action, pending] = useActionState(refreshQaPages.bind(null, siteId), undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "Crawling sitemap…" : "Refresh pages from sitemap"}
      </button>
      {state?.message ? <span className="text-sm text-green-700">{state.message}</span> : null}
      {state?.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
    </form>
  );
}

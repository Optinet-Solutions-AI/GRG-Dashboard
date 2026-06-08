"use client";

import { useActionState } from "react";
import { autofillPagespeed } from "@/app/(app)/pagespeed/autofill-actions";

type UrlOption = { id: string; url: string; label?: string | null };

export function PsiAutofillButton({ urls }: { urls: UrlOption[] }) {
  const [state, action, pending] = useActionState(autofillPagespeed, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <span className="text-sm font-medium text-slate-700">Auto-fill (PageSpeed Insights):</span>
      <select name="pagespeed_url_id" required className="rounded-md border border-slate-300 px-2 py-1 text-sm">
        <option value="">Select URL…</option>
        {urls.map((u) => (
          <option key={u.id} value={u.id}>{u.label || u.url}</option>
        ))}
      </select>
      <button type="submit" disabled={pending}
        className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
        {pending ? "Fetching…" : "Auto-fill from PSI"}
      </button>
      {state?.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
      {state?.ok ? <span className="text-sm text-green-700">Saved today’s scores ✓</span> : null}
    </form>
  );
}

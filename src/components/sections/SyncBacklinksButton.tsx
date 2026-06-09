"use client";

import { useActionState } from "react";
import { syncBacklinks } from "@/app/(app)/backlinks/actions";

export function SyncBacklinksButton() {
  const [state, action, pending] = useActionState(syncBacklinks, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Syncing…" : "Sync from Google Sheet"}
      </button>
      {state?.message ? <span className="text-sm text-green-700">{state.message}</span> : null}
      {state?.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
    </form>
  );
}

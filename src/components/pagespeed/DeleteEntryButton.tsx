"use client";

import { deletePagespeedEntry } from "@/app/(app)/pagespeed/actions";

export function DeleteEntryButton({ id }: { id: string }) {
  return (
    <form
      action={deletePagespeedEntry.bind(null, id)}
      onSubmit={(e) => { if (!confirm("Delete this PageSpeed record? This can't be undone.")) e.preventDefault(); }}
    >
      <button type="submit" className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
        Delete
      </button>
    </form>
  );
}

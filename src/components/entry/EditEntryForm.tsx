"use client";

import { useActionState, useState } from "react";
import { ScreenshotInput } from "@/components/ScreenshotInput";
import type { FieldSpec } from "@/lib/entries/entry-fields";

type State = { error?: string } | undefined;

/**
 * Collapsed inline editor for one date-stamped entry, driven by the same FieldSpec
 * list the server action validates against — so the input types can't drift from
 * the validation (date picker for dates, step 0.01 for decimal scores, step 1 for
 * counts). Collapsed by default to keep the row summaries readable.
 */
export function EditEntryForm({
  fields,
  initial,
  action,
  deleteAction,
  screenshotLabel,
}: {
  fields: FieldSpec[];
  initial: Record<string, unknown>;
  action: (prev: State, formData: FormData) => Promise<State>;
  deleteAction?: () => Promise<void>;
  screenshotLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, undefined);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Edit
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <form action={formAction} className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {fields.map((f) => (
          <label key={f.name} className="flex flex-col text-xs text-slate-600">
            {f.label}
            {f.kind === "date" ? (
              <input
                name={f.name}
                type="date"
                required
                defaultValue={(initial[f.name] as string | null) ?? ""}
                className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900"
              />
            ) : (
              <input
                name={f.name}
                type="number"
                step={f.kind === "decimal" ? "0.01" : "1"}
                min={f.min}
                max={f.max}
                defaultValue={(initial[f.name] as number | null) ?? ""}
                className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900"
              />
            )}
          </label>
        ))}

        {screenshotLabel ? (
          <div className="col-span-2 md:col-span-3">
            <ScreenshotInput name="screenshot" label={screenshotLabel} />
          </div>
        ) : null}

        <div className="col-span-2 mt-1 flex flex-wrap items-center gap-3 md:col-span-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-500 hover:underline">
            Cancel
          </button>
          {state?.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
        </div>
      </form>

      {deleteAction ? (
        <form
          action={deleteAction}
          onSubmit={(e) => {
            if (!confirm("Delete this entry? This cannot be undone.")) e.preventDefault();
          }}
          className="mt-2 border-t border-slate-200 pt-2"
        >
          <button type="submit" className="text-xs font-medium text-red-600 hover:underline">
            Delete this entry
          </button>
        </form>
      ) : null}
    </div>
  );
}

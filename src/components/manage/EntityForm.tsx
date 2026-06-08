"use client";

import { useActionState, useEffect, useRef } from "react";
import type { Field } from "@/lib/manage/entities";
import type { ActionState } from "@/lib/manage/actions";

type SiteOption = { id: string; display_name: string };

export function EntityForm({
  fields,
  action,
  siteOptions,
  initial,
  submitLabel,
  resetOnSuccess = false,
}: {
  fields: Field[];
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  siteOptions: SiteOption[];
  initial?: Record<string, unknown>;
  submitLabel: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  // The "add" form clears itself after a successful create so the next entry starts blank.
  // Edit forms (resetOnSuccess=false) keep the saved values shown.
  useEffect(() => {
    if (state?.success && resetOnSuccess) formRef.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
      {fields.map((f) => {
        const val = initial?.[f.name];
        if (f.type === "boolean") {
          return (
            <label key={f.name} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={f.name} defaultChecked={val === undefined ? f.defaultValue === true : Boolean(val)} />
              {f.label}
            </label>
          );
        }
        if (f.type === "site") {
          return (
            <label key={f.name} className="flex flex-col text-sm">
              <span className="mb-1 text-slate-600">{f.label}</span>
              <select name={f.name} defaultValue={(val as string) ?? ""} required={f.required}
                className="rounded-md border border-slate-300 px-2 py-1.5">
                <option value="" disabled>Select…</option>
                {siteOptions.map((s) => (<option key={s.id} value={s.id}>{s.display_name}</option>))}
              </select>
            </label>
          );
        }
        return (
          <label key={f.name} className="flex flex-col text-sm">
            <span className="mb-1 text-slate-600">{f.label}</span>
            <input
              name={f.name}
              type={f.type === "number" ? "number" : "text"}
              required={f.required}
              defaultValue={val === undefined ? (f.defaultValue as string | number | undefined) ?? "" : String(val ?? "")}
              className="rounded-md border border-slate-300 px-2 py-1.5"
            />
          </label>
        );
      })}
      <button type="submit" disabled={pending}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
        {pending ? "Saving…" : submitLabel}
      </button>
      {state?.error ? <p className="w-full text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}

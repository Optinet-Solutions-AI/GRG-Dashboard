"use client";

import { useActionState } from "react";

type Page = { id: string; url: string };
type Element = { id: string; name: string };
type State = { error?: string } | undefined;

export function QaEditor({
  pages, elements, checked, action,
}: {
  pages: Page[];
  elements: Element[];
  checked: Record<string, boolean>; // key `${pageId}|${elementId}`
  action: (prev: State, formData: FormData) => Promise<State>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-3 py-2 font-medium">Page</th>
              {elements.map((e) => (<th key={e.id} className="px-3 py-2 text-center font-medium">{e.name}</th>))}
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <tr key={p.id} className="border-b border-slate-100">
                <td className="px-3 py-2 text-slate-700">{p.url}</td>
                {elements.map((e) => (
                  <td key={e.id} className="px-3 py-2 text-center">
                    <input type="checkbox" name={`chk__${p.id}__${e.id}`} defaultChecked={!!checked[`${p.id}|${e.id}`]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">{pending ? "Saving…" : "Save checklist"}</button>
        {state?.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
      </div>
    </form>
  );
}

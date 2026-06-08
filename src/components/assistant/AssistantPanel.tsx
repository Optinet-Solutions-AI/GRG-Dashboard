"use client";

import { useActionState } from "react";
import { askAssistant } from "@/app/(app)/assistant/actions";
import { QUESTIONS } from "@/lib/assistant/questions";

export function AssistantPanel({ siteId }: { siteId?: string | null }) {
  const [state, action, pending] = useActionState(askAssistant, undefined);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Assistant</h2>
      <form action={action} className="flex flex-wrap gap-2">
        <input type="hidden" name="siteId" value={siteId ?? ""} />
        {QUESTIONS.map((q) => (
          <button key={q.id} type="submit" name="questionId" value={q.id} disabled={pending}
            className="rounded-full border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {q.label}
          </button>
        ))}
      </form>
      <div className="mt-3 min-h-[1.5rem] text-sm">
        {pending ? <span className="text-slate-400">Thinking…</span> : null}
        {state?.answer ? <p className="text-slate-800">{state.answer}</p> : null}
        {state?.error ? <p className="text-red-600">{state.error}</p> : null}
      </div>
    </section>
  );
}

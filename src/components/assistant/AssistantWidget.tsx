"use client";

import { useActionState, useState } from "react";
import { askAssistant } from "@/app/(app)/assistant/actions";
import { QUESTIONS } from "@/lib/assistant/questions";

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(askAssistant, undefined);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close assistant" : "Open assistant"}
        className="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-lg text-white shadow-lg transition hover:bg-slate-700"
      >
        {open ? "✕" : "💬"}
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-50 flex max-h-[70vh] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-800">Assistant</span>
            <span className="ml-2 text-xs text-slate-400">data insights · no setup</span>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3 text-sm">
            <p className="text-slate-500">Ask about rankings, PageSpeed, health, or data freshness — type a question or tap one below.</p>
            {pending ? <p className="text-slate-400">Thinking…</p> : null}
            {state?.answer ? <p className="rounded-lg bg-slate-50 p-2.5 text-slate-800">{state.answer}</p> : null}
            {state?.error ? <p className="text-red-600">{state.error}</p> : null}
          </div>

          <form action={action} className="border-t border-slate-100 p-2.5">
            <div className="mb-2 flex flex-wrap gap-1">
              {QUESTIONS.map((qq) => (
                <button
                  key={qq.id}
                  type="submit"
                  name="questionId"
                  value={qq.id}
                  disabled={pending}
                  className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  {qq.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                name="q"
                placeholder="Type a question…"
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
              />
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Ask
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

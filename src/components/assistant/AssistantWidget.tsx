"use client";

import { useEffect, useRef, useState } from "react";
import { askAssistant } from "@/app/(app)/assistant/actions";

type Msg = { role: "user" | "bot"; text: string };

const GREETING =
  "Hi! Ask me about your rankings, PageSpeed, site health, or how fresh the data is.";

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([{ role: "bot", text: GREETING }]);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending, open]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || pending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("q", q);
      const res = await askAssistant(undefined, fd);
      setMessages((m) => [...m, { role: "bot", text: res.error ?? res.answer ?? "Sorry, I couldn't answer that." }]);
    } catch {
      setMessages((m) => [...m, { role: "bot", text: "Something went wrong. Please try again." }]);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close chat" : "Open chat"}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-2xl text-white shadow-xl transition hover:bg-blue-700"
      >
        {open ? "✕" : "💬"}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-50 flex h-[28rem] max-h-[calc(100vh-7rem)] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center gap-3 bg-blue-600 px-4 py-3 text-white">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-lg">🤖</div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">Assistant</div>
              <div className="text-[11px] text-blue-100">Always active · instant answers</div>
            </div>
          </div>

          {/* Thread */}
          <div ref={threadRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-50 px-3 py-3">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={[
                    "max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm shadow-sm",
                    m.role === "user"
                      ? "rounded-br-md bg-blue-600 text-white"
                      : "rounded-bl-md bg-white text-slate-800",
                  ].join(" ")}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {pending && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md bg-white px-3 py-2 text-sm text-slate-400 shadow-sm">Typing…</div>
              </div>
            )}
          </div>

          {/* Composer */}
          <form onSubmit={send} className="flex items-center gap-2 border-t border-slate-100 bg-white p-2.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Aa"
              aria-label="Type a message"
              className="min-w-0 flex-1 rounded-full bg-slate-100 px-4 py-2 text-sm outline-none focus:bg-slate-200/70"
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-40"
            >
              ➤
            </button>
          </form>
        </div>
      )}
    </>
  );
}

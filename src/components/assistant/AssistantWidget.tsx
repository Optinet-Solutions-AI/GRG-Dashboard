"use client";

import { useEffect, useRef, useState } from "react";
import { askAssistant } from "@/app/(app)/assistant/actions";

type Msg = { role: "user" | "bot"; text: string };

const GREETING =
  'Hi! Ask me anything about your data — type or use the mic. e.g. "what changed in the rankings?", "which keywords should I focus on?", "how many backlinks do we have?"';

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
type SRConstructor = new () => SpeechRecognitionLike;

function voiceScore(name: string): number {
  const n = name.toLowerCase();
  if (/natural|neural|online/.test(n)) return 3;
  if (/google/.test(n)) return 2;
  if (/zira|david|mark|hazel|desktop|sapi/.test(n)) return 0;
  return 1;
}

function toSpeech(text: string): string {
  return text
    .replace(/→/g, " to ")
    .replace(/↑/g, " up ")
    .replace(/↓/g, " down ")
    .replace(/#(\d+)/g, "position $1")
    .replace(/[""'][؀-ۿ][؀-ۿ\s]*[""']?/g, " a keyword ")
    .replace(/[؀-ۿ][؀-ۿ\s]*/g, " a keyword ")
    .replace(/•/g, " ")
    .replace(/·/g, ", ")
    .replace(/—/g, ", ")
    .replace(/[""]/g, "")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{25A0}-\u{25FF}\u{FE00}-\u{FE0F}]/gu, " ")
    .replace(/\s*\n+\s*/g, ". ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconChat({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
    </svg>
  );
}

function IconX({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
  );
}

function IconBot({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7H4a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2M7 14c0 2.21 1.79 4 4 4h2c2.21 0 4-1.79 4-4H7m6.5 1a1.5 1.5 0 0 1-1.5 1.5A1.5 1.5 0 0 1 10.5 15a1.5 1.5 0 0 1 1.5-1.5 1.5 1.5 0 0 1 1.5 1.5M8 12h2v2H8v-2m6 0h2v2h-2v-2m0 6H10v2h4v-2z" />
    </svg>
  );
}

function IconMic({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z" />
    </svg>
  );
}

function IconMicOff({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
    </svg>
  );
}

function IconVolume({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  );
}

function IconVolumeOff({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
    </svg>
  );
}

function IconSend({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([{ role: "bot", text: GREETING }]);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [speakOn, setSpeakOn] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState("");

  const threadRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const submitRef = useRef<(text: string) => void>(() => {});
  const speakOnRef = useRef(speakOn);
  speakOnRef.current = speakOn;
  const voiceURIRef = useRef(voiceURI);
  voiceURIRef.current = voiceURI;

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const load = () => {
      const en = window.speechSynthesis.getVoices()
        .filter((v) => v.lang.toLowerCase().startsWith("en"))
        .sort((a, b) => voiceScore(b.name) - voiceScore(a.name) || a.name.localeCompare(b.name));
      setVoices(en);
      setVoiceURI((cur) => cur || en[0]?.voiceURI || "");
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending, open]);

  function say(text: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const clean = toSpeech(text);
    if (!clean) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.rate = 0.95;
    u.lang = "en-US";
    const v = window.speechSynthesis.getVoices().find((x) => x.voiceURI === voiceURIRef.current);
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  }

  async function submitText(raw: string) {
    const q = raw.trim();
    if (!q || pending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("q", q);
      const res = await askAssistant(undefined, fd);
      const answer = res.error ?? res.answer ?? "Sorry, I couldn't answer that.";
      setMessages((m) => [...m, { role: "bot", text: answer }]);
      if (speakOnRef.current) say(answer);
    } catch {
      setMessages((m) => [...m, { role: "bot", text: "Something went wrong. Please try again." }]);
    } finally {
      setPending(false);
    }
  }
  submitRef.current = submitText;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR: SRConstructor | undefined =
      (window as unknown as { SpeechRecognition?: SRConstructor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: SRConstructor }).webkitSpeechRecognition;
    if (!SR) return;
    setVoiceSupported(true);
    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      transcript = transcript.trim();
      if (transcript) { setInput(transcript); submitRef.current(transcript); }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
  }, []);

  function toggleMic() {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (listening) { rec.stop(); setListening(false); return; }
    try { setInput(""); rec.start(); setListening(true); } catch { setListening(false); }
  }

  return (
    <>
      {/* Floating trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close assistant" : "Open assistant"}
        className={[
          "fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full",
          "bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/30",
          "transition-all duration-200 hover:scale-105 hover:shadow-blue-600/40",
          open ? "rotate-0" : "",
        ].join(" ")}
      >
        {open ? <IconX className="h-6 w-6" /> : <IconChat className="h-6 w-6" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-3 z-50 flex h-[32rem] max-h-[calc(100svh-7rem)] w-[22rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-2xl shadow-slate-900/15">

          {/* Header */}
          <div className="flex shrink-0 items-center gap-2.5 bg-gradient-to-r from-blue-700 to-blue-600 px-4 py-3 text-white">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20">
              <IconBot className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight">SEO Assistant</div>
              <div className="truncate text-[11px] leading-tight text-blue-200">
                {listening ? "Listening…" : "Instant answers from your data"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setSpeakOn((s) => !s); if (typeof window !== "undefined") window.speechSynthesis?.cancel(); }}
              aria-label={speakOn ? "Turn off spoken answers" : "Read answers aloud"}
              title={speakOn ? "Voice: on" : "Voice: off"}
              className={[
                "ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition",
                speakOn ? "bg-white/25 text-white" : "text-blue-300 hover:bg-white/15 hover:text-white",
              ].join(" ")}
            >
              {speakOn ? <IconVolume className="h-4 w-4" /> : <IconVolumeOff className="h-4 w-4" />}
            </button>
          </div>

          {/* Voice picker */}
          {speakOn && voices.length > 0 && (
            <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-xs">
              <span className="shrink-0 text-slate-500">Voice</span>
              <select
                value={voiceURI}
                onChange={(e) => setVoiceURI(e.target.value)}
                aria-label="Choose voice"
                className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-1.5 py-1 text-xs"
              >
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => say("Hi, this is how I sound.")}
                className="shrink-0 rounded bg-slate-200 px-2 py-1 font-medium text-slate-700 hover:bg-slate-300"
              >
                Test
              </button>
            </div>
          )}

          {/* Thread */}
          <div ref={threadRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start gap-2"}>
                {m.role === "bot" && (
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                    <IconBot className="h-3.5 w-3.5" />
                  </div>
                )}
                <div
                  className={[
                    "max-w-[78%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                    m.role === "user"
                      ? "rounded-tr-sm bg-blue-600 text-white shadow-sm"
                      : "rounded-tl-sm bg-slate-100 text-slate-800",
                  ].join(" ")}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {pending && (
              <div className="flex justify-start gap-2">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                  <IconBot className="h-3.5 w-3.5" />
                </div>
                <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-2.5">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
                </div>
              </div>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => { e.preventDefault(); submitText(input); }}
            className="flex shrink-0 items-center gap-2 border-t border-slate-100 bg-white p-2.5"
          >
            {voiceSupported && (
              <button
                type="button"
                onClick={toggleMic}
                aria-label={listening ? "Stop listening" : "Speak your question"}
                title={listening ? "Stop" : "Speak"}
                className={[
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all",
                  listening
                    ? "bg-red-500 text-white shadow-sm shadow-red-400/40 [animation:pulse_1s_ease-in-out_infinite]"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700",
                ].join(" ")}
              >
                {listening ? <IconMicOff className="h-4.5 w-4.5" /> : <IconMic className="h-4.5 w-4.5" />}
              </button>
            )}
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={listening ? "Listening…" : "Ask anything…"}
              aria-label="Type a message"
              className="min-w-0 flex-1 rounded-full bg-slate-100 px-4 py-2 text-sm outline-none transition focus:bg-slate-100/80 focus:ring-2 focus:ring-blue-500/30"
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-40"
            >
              <IconSend className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

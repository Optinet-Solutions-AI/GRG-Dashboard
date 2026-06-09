"use client";

import { useEffect, useRef, useState } from "react";
import { askAssistant } from "@/app/(app)/assistant/actions";

type Msg = { role: "user" | "bot"; text: string };

const GREETING =
  "Hi! Ask me anything about your data — type or tap the mic and talk. e.g. “what changed in the rankings?”, “which keywords should I focus on?”, “how many backlinks do we have?”";

// Minimal typing for the browser SpeechRecognition API (not in the standard DOM lib).
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

  // Load the browser's available voices (English) so the user can pick one.
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const load = () => {
      const en = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
      setVoices(en);
      setVoiceURI((cur) => cur || en.find((v) => /Google|Natural|Microsoft/i.test(v.name))?.voiceURI || en[0]?.voiceURI || "");
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
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = window.speechSynthesis.getVoices().find((x) => x.voiceURI === voiceURIRef.current);
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  }
  function speak(text: string) {
    if (speakOnRef.current) say(text);
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
      speak(answer);
    } catch {
      setMessages((m) => [...m, { role: "bot", text: "Something went wrong. Please try again." }]);
    } finally {
      setPending(false);
    }
  }
  submitRef.current = submitText;

  // Set up speech recognition once, client-side.
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
      if (transcript) {
        setInput(transcript);
        submitRef.current(transcript);
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
  }, []);

  function toggleMic() {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (listening) {
      rec.stop();
      setListening(false);
      return;
    }
    try {
      setInput("");
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    submitText(input);
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
              <div className="text-[11px] text-blue-100">{listening ? "Listening…" : "Always active · instant answers"}</div>
            </div>
            <button
              type="button"
              onClick={() => { setSpeakOn((s) => !s); if (typeof window !== "undefined") window.speechSynthesis?.cancel(); }}
              aria-label={speakOn ? "Turn off spoken answers" : "Read answers aloud"}
              title={speakOn ? "Spoken answers: on" : "Spoken answers: off"}
              className="ml-auto flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/15"
            >
              {speakOn ? "🔊" : "🔇"}
            </button>
          </div>

          {/* Voice picker (only when spoken answers are on) */}
          {speakOn && voices.length > 0 && (
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-xs">
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
              <button type="button" onClick={() => say("Hi, this is how I sound.")} className="shrink-0 rounded bg-slate-200 px-2 py-1 font-medium text-slate-700 hover:bg-slate-300">
                Test
              </button>
            </div>
          )}

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
            {voiceSupported && (
              <button
                type="button"
                onClick={toggleMic}
                aria-label={listening ? "Stop listening" : "Speak your question"}
                title={listening ? "Stop" : "Speak"}
                className={[
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition",
                  listening ? "animate-pulse bg-red-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                ].join(" ")}
              >
                🎤
              </button>
            )}
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={listening ? "Listening…" : "Aa"}
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

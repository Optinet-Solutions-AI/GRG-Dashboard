"use client";

import { useRef, useState } from "react";

export function ScreenshotInput({ name, label }: { name: string; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);

  function applyFile(file: File) {
    const dt = new DataTransfer();
    dt.items.add(file);
    if (ref.current) ref.current.files = dt.files;
    setFileName(file.name || "pasted-image.png");
  }

  async function handlePaste() {
    setPasting(true);
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/")) ?? "";
        if (type) {
          const blob = await item.getType(type);
          applyFile(new File([blob], "pasted-screenshot.png", { type }));
          return;
        }
      }
      alert("No image found in clipboard. Copy a screenshot first, then click Paste.");
    } catch {
      // Fall back to onPaste handler — browser may not support clipboard.read()
      ref.current?.focus();
    } finally {
      setPasting(false);
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) { applyFile(file); e.preventDefault(); return; }
      }
    }
  }

  return (
    <div className="flex flex-col text-xs">
      <span className="mb-1 text-slate-500">{label}</span>
      <input
        ref={ref}
        name={name}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
      />
      <div className="flex flex-wrap items-center gap-2" onPaste={onPaste}>
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50"
        >
          Choose file
        </button>
        <button
          type="button"
          onClick={handlePaste}
          disabled={pasting}
          title="Paste screenshot from clipboard (Ctrl+V)"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {pasting ? "Pasting…" : "Paste"}
        </button>
        <span className="max-w-[10rem] truncate text-slate-500">{fileName ?? "No file chosen"}</span>
      </div>
    </div>
  );
}

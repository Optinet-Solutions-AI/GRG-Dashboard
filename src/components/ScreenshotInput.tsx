"use client";

import { useRef, useState } from "react";

export function ScreenshotInput({ name, label }: { name: string; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);

  function applyFile(file: File) {
    // Swap in the file on the hidden input
    const dt = new DataTransfer();
    dt.items.add(file);
    if (ref.current) ref.current.files = dt.files;
    setFileName(file.name || "pasted-image.png");
    // Revoke previous object URL to avoid memory leaks, then create new one
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
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
      alert("Clipboard access denied. Use Choose file instead, or grant clipboard permission in your browser.");
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
    <div className="flex flex-col gap-2 text-xs">
      <span className="text-slate-500">{label}</span>
      <input
        ref={ref}
        name={name}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) applyFile(file);
        }}
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
          title="Paste screenshot from clipboard (Ctrl+C a screenshot, then click)"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {pasting ? "Pasting…" : "Paste"}
        </button>
        {fileName ? (
          <span className="max-w-[10rem] truncate text-green-700">{fileName}</span>
        ) : (
          <span className="text-slate-400">No file chosen</span>
        )}
      </div>

      {/* Preview */}
      {previewUrl ? (
        <div className="relative w-full overflow-hidden rounded-lg border border-slate-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Screenshot preview"
            className="w-full object-contain"
            style={{ maxHeight: "12rem" }}
          />
          <button
            type="button"
            onClick={() => {
              if (ref.current) ref.current.value = "";
              setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
              setFileName(null);
            }}
            className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-[10px] text-white hover:bg-black/70"
            title="Remove image"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-400"
          onPaste={onPaste}
          tabIndex={0}
        >
          No screenshot
        </div>
      )}
    </div>
  );
}

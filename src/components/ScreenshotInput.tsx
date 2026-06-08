"use client";

import { useRef, useState } from "react";

export function ScreenshotInput({ name, label }: { name: string; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
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
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50"
        >
          Choose image…
        </button>
        <span className="max-w-[10rem] truncate text-slate-500">{fileName ?? "No file chosen"}</span>
      </div>
    </div>
  );
}

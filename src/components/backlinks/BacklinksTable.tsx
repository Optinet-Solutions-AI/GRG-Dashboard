"use client";

import { useMemo, useState } from "react";

export type BacklinkRow = {
  id: string;
  date: string;
  source_site: string | null;
  source_url: string | null;
  anchor_text: string | null;
  target_url: string | null;
  indexed: string | null;
  status: string | null;
};

type SortKey = "date" | "source" | "anchor" | "target" | "status" | "indexed";

function isIndexed(v: string | null): boolean {
  if (!v) return false;
  return !/^(no|not)/i.test(v.trim());
}

const COLS: { key: SortKey; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "source", label: "Source" },
  { key: "anchor", label: "Keyword / anchor" },
  { key: "target", label: "Target" },
  { key: "status", label: "Status" },
  { key: "indexed", label: "Indexed" },
];

function valueFor(r: BacklinkRow, key: SortKey): string | number {
  switch (key) {
    case "date": return r.date ?? "";
    case "source": return (r.source_site ?? r.source_url ?? "").toLowerCase();
    case "anchor": return (r.anchor_text ?? "").toLowerCase();
    case "target": return (r.target_url ?? "").toLowerCase();
    case "status": return (r.status ?? "").toLowerCase();
    case "indexed": return isIndexed(r.indexed) ? 1 : 0;
  }
}

export function BacklinksTable({ rows }: { rows: BacklinkRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = valueFor(a, sort.key);
      const bv = valueFor(b, sort.key);
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sort]);

  function toggle(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "date" ? "desc" : "asc" }));
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[44rem] text-sm">
        <thead className="sticky top-0 bg-slate-50">
          <tr className="border-b border-slate-200 text-left text-slate-500">
            {COLS.map((c) => {
              const active = sort.key === c.key;
              return (
                <th key={c.key} className="px-3 py-2 font-medium">
                  <button
                    type="button"
                    onClick={() => toggle(c.key)}
                    className={`inline-flex items-center gap-1 hover:text-slate-900 ${active ? "text-slate-900" : ""}`}
                  >
                    {c.label}
                    <span className="text-[10px] text-slate-400">{active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="border-b border-slate-100 align-top hover:bg-slate-50/60">
              <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.date}</td>
              <td className="px-3 py-2">
                {r.source_url
                  ? <a href={r.source_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{r.source_site ?? r.source_url}</a>
                  : (r.source_site ?? "—")}
              </td>
              <td className="px-3 py-2 text-slate-700">{r.anchor_text ?? "—"}</td>
              <td className="max-w-[18rem] truncate px-3 py-2">
                {r.target_url
                  ? <a href={r.target_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{r.target_url.replace(/^https?:\/\//, "")}</a>
                  : "—"}
              </td>
              <td className="px-3 py-2 text-slate-600">{r.status ?? "—"}</td>
              <td className="px-3 py-2">{isIndexed(r.indexed) ? <span className="font-semibold text-green-600">✓</span> : <span className="text-slate-300">—</span>}</td>
            </tr>
          ))}
          {sorted.length === 0 ? <tr><td colSpan={6} className="px-3 py-3 text-slate-500">No backlinks yet.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

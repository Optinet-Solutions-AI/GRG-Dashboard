export type SheetBacklink = {
  source_site: string;
  source_url: string;
  anchor_text: string;
  target_url: string;
  indexed: string | null;
  status: string | null;
  remarks: string | null;
  date: string; // yyyy-mm-dd, from the section's date marker
};

/** Split one CSV line, honoring quoted fields with embedded commas/quotes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function toIso(d: string): string | null {
  const m = d.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/**
 * Parse the GRG backlinks Google Sheet CSV. Columns:
 * ARTICLE/BLOGS, BACKLINK, KEYWORD, URL, Indexed In Google, STATUS, REMARKS.
 * Rows are grouped under date markers (col0 empty, col1 = M/D/YYYY).
 */
export function parseBacklinkSheet(csv: string): SheetBacklink[] {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/);
  const out: SheetBacklink[] = [];
  let currentDate: string | null = null;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const f = splitCsvLine(raw);
    const c0 = (f[0] ?? "").trim();
    const c1 = (f[1] ?? "").trim();
    if (!c0 && toIso(c1)) { currentDate = toIso(c1); continue; } // date marker
    const head = c0.toUpperCase();
    if (!c0 || head === "ARTICLE/BLOGS" || head === "GULFRECOVERYGROUP") continue; // title/header
    if (!c1 || !currentDate) continue; // need a backlink URL under a dated section
    out.push({
      source_site: c0,
      source_url: c1,
      anchor_text: (f[2] ?? "").trim(),
      target_url: (f[3] ?? "").trim(),
      indexed: (f[4] ?? "").trim() || null,
      status: (f[5] ?? "").trim() || null,
      remarks: (f[6] ?? "").trim() || null,
      date: currentDate,
    });
  }
  return out;
}

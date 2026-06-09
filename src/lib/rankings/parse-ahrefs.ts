// Parses an Ahrefs Rank Tracker "Overview" export (UTF-16LE or UTF-8, tab- or comma-delimited)
// into typed rows. Pure functions — no IO — so they are unit-testable and shared by the
// in-app upload action and the CLI importer.

export type AhrefsRow = {
  keyword: string;
  countryCode: string;
  current: number | null; // 1..100, or null for "not ranking"
  previous: number | null;
  date: string; // yyyy-mm-dd (from "Current update date")
};

function clean(s: string | undefined): string {
  return String(s ?? "")
    .replace(/^﻿/, "")
    .replace(/[‎‏‪-‮]/g, "") // strip RTL/LTR marks
    .trim()
    .replace(/^"([\s\S]*)"$/, "$1")
    .trim();
}

/** A position is valid only if it's an integer in 1..100; anything else (blank, >100, junk) is NR (null). */
export function toPosition(raw: string | undefined): number | null {
  const n = parseInt(clean(raw), 10);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null;
}

/** Decode a raw export file to text, detecting UTF-16LE vs UTF-8 (with or without BOM). */
export function decodeExport(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  // No BOM: a high ratio of NUL bytes indicates UTF-16LE.
  const sample = Math.min(bytes.length, 2000);
  let nul = 0;
  for (let i = 0; i < sample; i++) if (bytes[i] === 0) nul++;
  if (sample > 0 && nul / sample > 0.2) return new TextDecoder("utf-16le").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}

/** Parse decoded export text into rows. Throws if the expected columns aren't present. */
export function parseAhrefsExport(text: string): AhrefsRow[] {
  const body = text.replace(/^﻿/, "");
  const lines = body.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const delim = lines[0].split("\t").length >= lines[0].split(",").length ? "\t" : ",";
  const header = lines[0].split(delim).map(clean);
  const idx = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const iKw = idx("Keyword");
  const iPrev = idx("Previous position");
  const iCur = idx("Current position");
  const iCc = idx("Country code");
  const iDate = idx("Current update date");
  if (iKw < 0 || iCur < 0 || iCc < 0) {
    throw new Error("Unrecognized export: missing Keyword / Current position / Country code columns.");
  }
  return lines.slice(1).map((line) => {
    const f = line.split(delim);
    return {
      keyword: clean(f[iKw]),
      countryCode: clean(f[iCc]).toUpperCase(),
      current: toPosition(f[iCur]),
      previous: iPrev >= 0 ? toPosition(f[iPrev]) : null,
      date: clean(f[iDate]).slice(0, 10),
    };
  });
}

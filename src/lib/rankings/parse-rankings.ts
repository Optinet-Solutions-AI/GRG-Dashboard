// Unified rankings-export parser. Supports two sources:
//   1. Ahrefs Rank Tracker "Overview" — UTF-16/UTF-8, tab/comma delimited, single domain.
//        columns: Keyword | Previous position | Current position | Country code | Current update date
//   2. Generic multi-domain rank-tracker .xlsx (SheetJS-style) — one sheet, many domains.
//        columns: Domain | Keyword | Country | Position | Previous | Change | Last Check
// Both normalise to RankingRow[]. Country full-names are mapped to the 2-letter codes the DB uses.
import ExcelJS from "exceljs";
import { decodeExport, parseAhrefsExport, toPosition } from "./parse-ahrefs";

export type RankingRow = {
  domain: string | null; // null when the source doesn't carry a domain (Ahrefs) → no filtering
  keyword: string;
  countryCode: string;
  current: number | null;
  previous: number | null;
  date: string; // yyyy-mm-dd
};

// Full country name (lowercased) → DB country code. Also accepts the codes themselves.
const COUNTRY_TO_CODE: Record<string, string> = {
  "united arab emirates": "AE", uae: "AE", emirates: "AE", ae: "AE",
  "saudi arabia": "SA", ksa: "SA", "kingdom of saudi arabia": "SA", sa: "SA",
  qatar: "QA", qa: "QA",
  kuwait: "KW", kw: "KW",
  bahrain: "BH", bh: "BH",
  oman: "OM", "sultanate of oman": "OM", om: "OM",
};

/** Map a country cell (full name or code) to the DB's 2-letter code. Unknown → uppercased input (will be reported as unmatched). */
export function normalizeCountry(raw: unknown): string {
  const s = String(raw ?? "").trim();
  const code = COUNTRY_TO_CODE[s.toLowerCase()];
  return code ?? s.toUpperCase();
}

/** Positions arrive as numbers (xlsx) or strings ("Not Ranking", "12", ">100"). Only 1..100 is a real rank. */
export function toPositionValue(v: unknown): number | null {
  if (typeof v === "number") return Number.isInteger(v) && v >= 1 && v <= 100 ? v : null;
  return toPosition(v == null ? "" : String(v));
}

/** Pull a yyyy-mm-dd out of a date/text cell ("2026-07-20 02:45", a Date, or a serial-free string). */
export function toDate(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const m = String(v ?? "").match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : "";
}

/** exceljs cells can be strings, numbers, Dates, or rich objects — flatten to a primitive-ish value. */
function cellValue(v: unknown): unknown {
  if (v == null || typeof v !== "object") return v;
  if (v instanceof Date) return v;
  const o = v as Record<string, unknown>;
  if (typeof o.text === "string") return o.text; // hyperlink / formula-with-text
  if (o.result !== undefined) return o.result; // formula result
  if (Array.isArray(o.richText)) return o.richText.map((t) => (t as { text: string }).text).join("");
  return String(v);
}

const XLSX_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04" — every .xlsx (zip) starts with this.
export function isXlsx(bytes: Uint8Array): boolean {
  return XLSX_MAGIC.every((b, i) => bytes[i] === b);
}

/** Parse a generic multi-domain rank-tracker .xlsx into RankingRow[]. */
export async function parseXlsxRankings(bytes: Uint8Array): Promise<RankingRow[]> {
  const wb = new ExcelJS.Workbook();
  // exceljs wants a Node Buffer / ArrayBuffer
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const headerCells = (ws.getRow(1).values as unknown[]) ?? [];
  const col: Record<string, number> = {};
  headerCells.forEach((h, i) => {
    const name = String(cellValue(h) ?? "").trim().toLowerCase();
    if (name) col[name] = i; // exceljs values are 1-indexed
  });
  const need = (...names: string[]) => names.map((n) => col[n]).find((i) => i != null);
  const cKw = need("keyword");
  const cCountry = need("country", "country code");
  const cPos = need("position", "current position", "current");
  const cPrev = need("previous", "previous position");
  const cDom = need("domain", "url", "target");
  const cDate = need("last check", "current update date", "date", "checked");
  if (cKw == null || cCountry == null || cPos == null) {
    throw new Error("Unrecognized .xlsx export: missing Keyword / Country / Position columns.");
  }

  const out: RankingRow[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const get = (i: number | undefined) => (i == null ? undefined : cellValue(row.getCell(i).value));
    const keyword = String(get(cKw) ?? "").trim();
    if (!keyword) return;
    out.push({
      domain: cDom != null ? String(get(cDom) ?? "").trim().toLowerCase() || null : null,
      keyword,
      countryCode: normalizeCountry(get(cCountry)),
      current: toPositionValue(get(cPos)),
      previous: cPrev != null ? toPositionValue(get(cPrev)) : null,
      date: toDate(get(cDate)),
    });
  });
  return out;
}

/** Detect the format from the raw bytes and parse to normalised rows. */
export async function parseRankingsFile(bytes: Uint8Array): Promise<RankingRow[]> {
  if (isXlsx(bytes)) return parseXlsxRankings(bytes);
  // Fall back to the delimited Ahrefs export (single domain → domain null, no filtering).
  return parseAhrefsExport(decodeExport(bytes)).map((r) => ({
    domain: null,
    keyword: r.keyword,
    countryCode: r.countryCode,
    current: r.current,
    previous: r.previous,
    date: r.date,
  }));
}

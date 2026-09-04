// Field specs for the hand-entered, date-stamped records (SEO / PageSpeed / Health).
//
// One spec per section, shared by BOTH the add and the update action, so the two can
// never disagree about what's a decimal, what's a count, or what range applies. Only
// fields listed here are ever read from a form, so extra posted values can't be
// persisted (same invariant as buildRow for the generic manage forms).

import { parseDecimalField, parseIntegerField, type NumResult } from "@/lib/numeric";

export type FieldKind = "date" | "decimal" | "integer";
export type FieldSpec = {
  name: string;
  label: string;
  kind: FieldKind;
  min?: number;
  max?: number;
};

export type DateResult = { ok: true; value: string } | { ok: false; error: string };
export type BuildResult =
  | { ok: true; record: Record<string, string | number | null> }
  | { ok: false; error: string };

/** Validate a yyyy-mm-dd date, including that it actually exists on the calendar. */
export function parseIsoDate(raw: unknown, label: string): DateResult {
  const s = String(raw ?? "").trim();
  if (s === "") return { ok: false, error: `${label} is required` };
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { ok: false, error: `${label} must be a date (YYYY-MM-DD)` };
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Round-trip through UTC: 2026-02-31 becomes 2026-03-03, which won't match.
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return { ok: false, error: `${label} is not a real date` };
  }
  return { ok: true, value: s };
}

const SCORE = { kind: "decimal", min: 0, max: 100 } as const;
// Tallies and Ahrefs metrics are decimal too: every column they write is
// numeric(_,2), and an integer-only input made the browser refuse "3.5" with
// "the two nearest valid values are 3 and 4" before the form was ever submitted.
const COUNT = { kind: "decimal", min: 0 } as const;

export const SEO_FIELDS: FieldSpec[] = [
  { name: "date", label: "Date", kind: "date" },
  { name: "seo_score", label: "SEO score", ...SCORE },
  { name: "passed_tests", label: "Passed", ...COUNT },
  { name: "warnings", label: "Warnings", ...COUNT },
  { name: "failed_tests", label: "Failed", ...COUNT },
];

export const PAGESPEED_FIELDS: FieldSpec[] = [
  { name: "date", label: "Date", kind: "date" },
  { name: "mobile_score", label: "Mobile performance", ...SCORE },
  { name: "mobile_accessibility", label: "Mobile accessibility", ...SCORE },
  { name: "mobile_best_practices", label: "Mobile best practices", ...SCORE },
  { name: "mobile_seo", label: "Mobile SEO", ...SCORE },
  { name: "desktop_score", label: "Desktop performance", ...SCORE },
  { name: "desktop_accessibility", label: "Desktop accessibility", ...SCORE },
  { name: "desktop_best_practices", label: "Desktop best practices", ...SCORE },
  { name: "desktop_seo", label: "Desktop SEO", ...SCORE },
];

// Ahrefs figures. `date` is included here on purpose: updateHealthNumbers used to
// omit it, which is exactly why the date wasn't editable.
export const HEALTH_FIELDS: FieldSpec[] = [
  { name: "date", label: "Date", kind: "date" },
  { name: "domain_rating", label: "Domain Rating", ...COUNT },
  { name: "referring_domains", label: "Referring Domains", ...COUNT },
  { name: "total_visitors", label: "Total Visitors", ...COUNT },
  { name: "organic_traffic", label: "Organic Traffic", ...COUNT },
  { name: "organic_keywords", label: "Organic Keywords", ...COUNT },
];

export function buildEntryRecord(specs: FieldSpec[], get: (name: string) => string | null): BuildResult {
  const record: Record<string, string | number | null> = {};
  for (const spec of specs) {
    const raw = get(spec.name);
    if (spec.kind === "date") {
      const r = parseIsoDate(raw, spec.label);
      if (!r.ok) return { ok: false, error: r.error };
      record[spec.name] = r.value;
      continue;
    }
    const opts = { min: spec.min, max: spec.max };
    const r: NumResult =
      spec.kind === "decimal"
        ? parseDecimalField(raw, spec.label, opts)
        : parseIntegerField(raw, spec.label, opts);
    if (!r.ok) return { ok: false, error: r.error };
    record[spec.name] = r.value;
  }
  return { ok: true, record };
}

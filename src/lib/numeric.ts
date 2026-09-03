// Shared numeric parsing for admin-entered data.
//
// Scores and percentages accept decimals (the columns are numeric(5,2)); counts,
// ranks and sort orders stay whole. Both parsers report a labelled error rather
// than silently coercing — the old `parseInt("12.7")` quietly stored 12.

export type NumResult = { ok: true; value: number | null } | { ok: false; error: string };

const ARABIC_INDIC = /[\u0660-\u0669\u06F0-\u06F9]/g;

/** Arabic-first dashboard: accept ٨٧٫٥ as well as 87.5. */
function normalize(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) & 0xf))
    .replace(/[\u066B\u066C]/g, (c) => (c === "\u066B" ? "." : "")) // decimal sep / thousands sep
    .replace(/\s+/g, "");
}

function bounded(value: number, label: string, opts?: { min?: number; max?: number }): NumResult {
  const { min, max } = opts ?? {};
  if ((min != null && value < min) || (max != null && value > max)) {
    return { ok: false, error: `${label} must be between ${min ?? "-∞"} and ${max ?? "∞"}` };
  }
  return { ok: true, value };
}

/** Decimal-capable field (scores, percentages). Rounds to `maxDecimals` to match the column. */
export function parseDecimalField(
  raw: unknown,
  label: string,
  opts?: { min?: number; max?: number; maxDecimals?: number },
): NumResult {
  const s = normalize(raw);
  if (s === "") return { ok: true, value: null };
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(s)) return { ok: false, error: `${label} must be a number` };
  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false, error: `${label} must be a number` };
  const dp = opts?.maxDecimals ?? 2;
  const factor = 10 ** dp;
  return bounded(Math.round(n * factor) / factor, label, opts);
}

/** Whole-number field (counts, ranks, sort order). Rejects decimals outright. */
export function parseIntegerField(
  raw: unknown,
  label: string,
  opts?: { min?: number; max?: number },
): NumResult {
  const s = normalize(raw);
  if (s === "") return { ok: true, value: null };
  if (!/^-?\d+$/.test(s)) return { ok: false, error: `${label} must be a whole number` };
  return bounded(Number(s), label, opts);
}

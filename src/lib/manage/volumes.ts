import { parseDecimalField } from "@/lib/numeric";

export type VolumePayload = {
  globals: { keyword_id: string; volume: number | null }[];
  cells: { keyword_id: string; country_id: string; volume: number | null }[];
  errors: string[];
};

// "" -> null; non-negative number (decimals allowed) -> number; anything else ->
// error (returns null + pushes). volume is numeric(14,2), so 12000.5 is valid and
// the ceiling is the column's, not int4's.
const MAX_VOLUME = 999999999999.99;

function coerce(raw: FormDataEntryValue, label: string, errors: string[]): number | null {
  const r = parseDecimalField(raw, label, { min: 0 });
  if (!r.ok) {
    errors.push(r.error);
    return null;
  }
  if (r.value != null && r.value > MAX_VOLUME) {
    errors.push(`${label} is too large`);
    return null;
  }
  return r.value;
}

export function parseVolumeForm(formData: FormData): VolumePayload {
  const globals: VolumePayload["globals"] = [];
  const cells: VolumePayload["cells"] = [];
  const errors: string[] = [];

  for (const [key, value] of formData.entries()) {
    const g = key.match(/^g:(.+)$/);
    if (g) {
      globals.push({ keyword_id: g[1], volume: coerce(value, `GSV ${g[1]}`, errors) });
      continue;
    }
    const v = key.match(/^v:([^:]+):(.+)$/);
    if (v) {
      cells.push({ keyword_id: v[1], country_id: v[2], volume: coerce(value, `SV ${v[1]}/${v[2]}`, errors) });
    }
  }
  return { globals, cells, errors };
}

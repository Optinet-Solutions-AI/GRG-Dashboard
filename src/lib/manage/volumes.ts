export type VolumePayload = {
  globals: { keyword_id: string; volume: number | null }[];
  cells: { keyword_id: string; country_id: string; volume: number | null }[];
  errors: string[];
};

// "" -> null; non-negative integer -> number; anything else -> error (returns null + pushes).
function coerce(raw: FormDataEntryValue, label: string, errors: string[]): number | null {
  const s = String(raw).trim();
  if (s === "") return null;
  if (!/^\d+$/.test(s)) {
    errors.push(`${label} must be a whole number ≥ 0`);
    return null;
  }
  const n = parseInt(s, 10);
  if (n > 2147483647) {
    errors.push(`${label} is too large`);
    return null;
  }
  return n;
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

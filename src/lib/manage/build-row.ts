import type { Field } from "./entities";
import { parseDecimalField } from "@/lib/numeric";

type Raw = Record<string, string | undefined>;
export type BuiltRow = { data: Record<string, string | number | boolean | null>; errors: string[] };

/**
 * Coerce + validate raw form input against a field list. Only known fields are read.
 * INVARIANT: `data` is only safe to persist when `errors` is empty — a required-but-empty
 * text/site field still appears in `data` (as ""). Callers MUST check `errors` first.
 */
export function buildRow(fields: Field[], raw: Raw): BuiltRow {
  const data: Record<string, string | number | boolean | null> = {};
  const errors: string[] = [];

  for (const field of fields) {
    const rawValue = raw[field.name];
    switch (field.type) {
      case "boolean": {
        data[field.name] = rawValue === "on" || rawValue === "true";
        break;
      }
      case "number": {
        const trimmed = (rawValue ?? "").trim();
        if (trimmed === "") {
          if (field.required) {
            errors.push(`${field.label} is required`);
            data[field.name] = null;
          } else {
            // Empty optional number falls back to its configured default (e.g. sort_order=0,
            // which is NOT NULL in the DB) so clearing the field on edit doesn't send null.
            data[field.name] = typeof field.defaultValue === "number" ? field.defaultValue : null;
          }
        } else {
          // Every numeric column behind these forms is numeric(_,2) (sort_order,
          // search volume), so decimals are stored as typed instead of rejected.
          const r = parseDecimalField(trimmed, field.label);
          if (!r.ok) errors.push(r.error);
          else data[field.name] = r.value;
        }
        break;
      }
      case "text":
      case "site": {
        const trimmed = (rawValue ?? "").trim();
        if (trimmed === "") {
          if (field.required) errors.push(`${field.label} is required`);
          data[field.name] = field.required ? "" : null;
        } else {
          data[field.name] = trimmed;
        }
        break;
      }
    }
  }
  return { data, errors };
}

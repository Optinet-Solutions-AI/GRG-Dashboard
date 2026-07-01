// Friendly market labels shown instead of the raw ISO country code (e.g. AE -> UAE).
const MARKET_LABELS: Record<string, string> = { AE: "UAE" };

export function marketLabel(code: string): string {
  return MARKET_LABELS[code] ?? code;
}

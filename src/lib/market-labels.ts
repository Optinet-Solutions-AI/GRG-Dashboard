// Full market names for the ranking grid's column headers.
//
// The grid used to print the raw ISO code for everything but AE, so five of the six columns
// read "SA", "QA", "KW", "BH", "OM". The header is the only place the market is named, so it
// spells the country out.
const MARKET_LABELS: Record<string, string> = {
  AE: "United Arab Emirates",
  SA: "Saudi Arabia",
  QA: "Qatar",
  KW: "Kuwait",
  BH: "Bahrain",
  OM: "Oman",
};

export function marketLabel(code: string): string {
  return MARKET_LABELS[code] ?? code;
}

/** For places too narrow for the full name — chips, sentences listing several markets. */
const SHORT_LABELS: Record<string, string> = { AE: "UAE" };

export function marketLabelShort(code: string): string {
  return SHORT_LABELS[code] ?? MARKET_LABELS[code] ?? code;
}

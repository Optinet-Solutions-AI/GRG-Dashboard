// Market names for the ranking grid's column headers.
//
// The grid used to print the raw ISO code for five of the six markets — "SA", "QA", "KW",
// "BH", "OM" — and the header is the only place a market is named, so it now gives the
// country. The exception is the UAE, which is how people refer to it; "United Arab Emirates"
// only made that column wide.
const MARKET_LABELS: Record<string, string> = {
  AE: "UAE",
  SA: "Saudi Arabia",
  QA: "Qatar",
  KW: "Kuwait",
  BH: "Bahrain",
  OM: "Oman",
};

export function marketLabel(code: string): string {
  return MARKET_LABELS[code] ?? code;
}

/**
 * Kept as a separate entry point for prose, even though it currently matches `marketLabel`
 * for every market: "UAE" is the name people use, so spelling it out bought nothing and only
 * made the column wide.
 */
export function marketLabelShort(code: string): string {
  return marketLabel(code);
}

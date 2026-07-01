/** Thousands-separated integer for display; em dash for missing values. */
export function formatVolume(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}

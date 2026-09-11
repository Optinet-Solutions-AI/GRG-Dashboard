import type { SheetBacklink } from "./parse-sheet";

/**
 * Split sheet rows across sites by the domain each row's `target_url` points at.
 *
 * The GRG backlinks sheet holds links for several domains at once (.com and .org
 * today). The sync used to assign every row to a single hardcoded site, which
 * mis-attributed every .org link to .com. Routing by target fixes that and lets
 * one sheet feed every site.
 *
 * Every known site gets a bucket — including empty ones — so the caller clears a
 * site whose links were removed from the sheet instead of leaving them stale.
 *
 * A row whose target matches no known site is NOT filed under some default site.
 * That behaviour is how 40 .org links were once counted as .com backlinks, inflating
 * a client-facing total from 159 to 199 with no visible sign anything was wrong.
 * Unroutable rows come back to the caller instead, to be reported and skipped:
 * under-reporting is visible and correctable, mis-attribution is neither.
 */
export function routeBacklinksBySite(
  rows: SheetBacklink[],
  sites: Array<{ id: string; domain: string }>,
): { bySite: Map<string, SheetBacklink[]>; unrouted: SheetBacklink[] } {
  const byDomain = new Map(sites.map((s) => [s.domain.toLowerCase(), s.id]));
  const bySite = new Map<string, SheetBacklink[]>(sites.map((s) => [s.id, []]));
  const unrouted: SheetBacklink[] = [];

  for (const row of rows) {
    let id: string | undefined;
    try {
      // Exact hostname match (minus www) — so gulfrecoverygroup.com.br can't pass as .com.
      const host = new URL(row.target_url).hostname.toLowerCase().replace(/^www\./, "");
      id = byDomain.get(host);
    } catch {
      id = undefined;
    }
    if (!id) {
      unrouted.push(row);
      continue;
    }
    bySite.get(id)!.push(row);
  }

  return { bySite, unrouted };
}

/** Host of a row's target, for reporting which rows couldn't be placed. */
export function targetHost(row: SheetBacklink): string {
  try {
    return new URL(row.target_url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return row.target_url?.trim() ? `unparseable (${row.target_url.trim().slice(0, 40)})` : "(blank)";
  }
}

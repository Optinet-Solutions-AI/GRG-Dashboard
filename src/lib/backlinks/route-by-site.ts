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
 */
export function routeBacklinksBySite(
  rows: SheetBacklink[],
  sites: Array<{ id: string; domain: string }>,
  fallbackDomain: string,
): { bySite: Map<string, SheetBacklink[]>; unrouted: number } {
  const byDomain = new Map(sites.map((s) => [s.domain.toLowerCase(), s.id]));
  const fallbackId = byDomain.get(fallbackDomain.toLowerCase());
  if (!fallbackId) throw new Error(`Fallback site ${fallbackDomain} is not in the sites list`);

  const bySite = new Map<string, SheetBacklink[]>(sites.map((s) => [s.id, []]));
  let unrouted = 0;

  for (const row of rows) {
    let id: string | undefined;
    try {
      // Exact hostname match (minus www) — so gulfrecoverygroup.com.br can't pass as .com.
      const host = new URL(row.target_url).hostname.toLowerCase().replace(/^www\./, "");
      id = byDomain.get(host);
    } catch {
      id = undefined;
    }
    if (!id) { id = fallbackId; unrouted++; }
    bySite.get(id)!.push(row);
  }

  return { bySite, unrouted };
}

// Site scoping for the whole dashboard.
//
// There is no "all sites" view: the top-bar selector lists the real sites only, so
// every page renders exactly one site. A missing or unknown `?site=` resolves to the
// first site (by sort_order) — the same fallback the add-forms already used, now
// applied to the data queries too, so the header and the numbers can't disagree.

export type SiteRef = { id: string };

export function resolveSiteId<T extends SiteRef>(
  sites: T[] | null | undefined,
  requested?: string,
): string | null {
  const list = sites ?? [];
  return (requested ? list.find((s) => s.id === requested)?.id : undefined) ?? list[0]?.id ?? null;
}

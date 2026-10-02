import Link from "next/link";

export type GridLanguage = "ar" | "en";

/** `?lang=` is the switch; anything unrecognised falls back to Arabic, the tracked set. */
export function parseGridLanguage(value: string | undefined): GridLanguage {
  return value === "en" ? "en" : "ar";
}

/**
 * Switch the ranking grid between the Arabic and English keyword sets.
 *
 * The two never share a table: an English keyword dropped into the Arabic grid breaks the
 * market grouping and the reading direction at once. A link rather than client state, so
 * the choice survives a refresh and can be shared.
 *
 * It sits in its own labelled bar above the grid rather than beside the page title. Next to
 * the title the chips read as part of the heading ("Ranking — Gulf Recovery Group (.com)
 * Arabic 89 English 0") and nobody saw them as a control at all.
 */
export function LanguageToggle({
  site,
  current,
  counts,
}: {
  site?: string;
  current: GridLanguage;
  counts: Record<GridLanguage, number>;
}) {
  const href = (lang: GridLanguage) => {
    const p = new URLSearchParams();
    if (site) p.set("site", site);
    if (lang !== "ar") p.set("lang", lang);
    const q = p.toString();
    return q ? `/ranking?${q}` : "/ranking";
  };

  const tab = (lang: GridLanguage, label: string) => {
    const on = current === lang;
    return (
      <Link
        href={href(lang)}
        aria-current={on ? "page" : undefined}
        className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
          on ? "bg-slate-800 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        }`}
      >
        {label}
        <span
          className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
            on ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
          }`}
        >
          {counts[lang]}
        </span>
      </Link>
    );
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div>
        <p className="text-sm font-semibold text-slate-800">Keyword language</p>
        <p className="text-xs text-slate-500">
          {current === "ar"
            ? "Showing the Arabic keyword set. English keywords get their own grid."
            : "Showing the English keyword set."}
        </p>
      </div>
      <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
        {tab("ar", "Arabic")}
        {tab("en", "English")}
      </div>
    </div>
  );
}

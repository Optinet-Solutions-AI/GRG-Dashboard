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
        className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
          on ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        {label}
        <span className={`ml-1.5 text-xs ${on ? "text-slate-300" : "text-slate-400"}`}>{counts[lang]}</span>
      </Link>
    );
  };

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
      {tab("ar", "Arabic")}
      {tab("en", "English")}
    </div>
  );
}

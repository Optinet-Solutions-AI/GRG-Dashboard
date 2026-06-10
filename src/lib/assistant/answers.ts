import type { ParsedQuery } from "./nlu";

// Pure answer-formatters. No "server-only", no DB access — they take already-fetched
// data and return scannable text. This keeps them unit-testable without mocking
// Supabase; smart.ts does the fetching and delegates here.

export type GridRow = { keyword: string; country: string; position: number | null; prev_position: number | null };
export type QaPageRow = {
  url: string | null; indexed_gsc: string | null; status: string | null;
  seo_issues: string | null; ar_alignment_issues: string | null; images_missing_alt: string | null;
  title: string | null; meta_description: string | null; canonical: string | null; h1_count: string | null; lang: string | null;
};
export type SiteAuditRow = Record<string, string | null>;

export const COUNTRY_NAME: Record<string, string> = { SA: "Saudi Arabia", AE: "UAE", QA: "Qatar", OM: "Oman", KW: "Kuwait", BH: "Bahrain" };
export const cname = (code: string) => COUNTRY_NAME[code] ?? code;
export const bullets = (items: string[]) => items.map((i) => `• ${i}`).join("\n");

const CAP = 10;
function capList(head: string, items: string[]): string {
  if (items.length === 0) return `${head}\n• none 🎉`;
  const extra = items.length > CAP ? `\n…and ${items.length - CAP} more` : "";
  return `${head} (${items.length})\n${bullets(items.slice(0, CAP))}${extra}`;
}

const truthy = (v: string | null | undefined) => !!v && v.trim() !== "" && v.trim() !== "—";
// Treat as indexed only on an affirmative value. Crucially, "Not indexed" contains
// the substring "indexed" — so check for negative markers FIRST.
const isIndexed = (v: string | null) => {
  const s = (v ?? "").trim().toLowerCase();
  if (!s || s === "—") return false;
  if (/\b(no|not|none|false|pending|missing|excluded)\b/.test(s)) return false;
  return /\b(done|yes|indexed|index|true|ok|live)\b/.test(s);
};

// ───────────────────────── ranking ─────────────────────────
export function rankingAnswer(q: ParsedQuery, latest: string | null, prev: string | null, all: GridRow[]): string {
  if (!latest || all.length === 0) return "📊 Rankings\nNo ranking data has been imported yet.";
  const rows = q.country ? all.filter((r) => r.country === q.country) : all;
  const scope = q.country ? ` · ${cname(q.country)}` : "";
  const tag = (c: string) => (q.country ? "" : ` (${cname(c)})`);

  // specific keyword
  if (q.keyword) {
    const cells = all.filter((r) => r.keyword === q.keyword);
    if (cells.length === 0) return `I don't track “${q.keyword}”.`;
    const lines = cells.map((c) => {
      const pos = c.position == null ? "not ranking" : `#${c.position}`;
      let mv = "";
      if (c.position != null && c.prev_position != null) mv = c.position < c.prev_position ? ` (↑ from #${c.prev_position})` : c.position > c.prev_position ? ` (↓ from #${c.prev_position})` : " (no change)";
      else if (c.position != null && c.prev_position == null) mv = " (newly entered)";
      return `${cname(c.country)}: ${pos}${mv}`;
    });
    return `🔎 “${q.keyword}” · week ${latest}\n${bullets(lines)}`;
  }

  // not ranking
  if (q.notRanking) {
    const nr = rows.filter((r) => r.position == null);
    return capList(`🚫 Not ranking${scope} · week ${latest}`, nr.map((r) => `“${r.keyword}”${tag(r.country)}`));
  }

  // top-N threshold
  if (q.threshold) {
    const n = q.threshold.n;
    const inTop = rows.filter((r) => r.position != null && (r.position as number) <= n).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return capList(`🎯 In top ${n}${scope} · week ${latest}`, inTop.map((r) => `“${r.keyword}”${tag(r.country)} #${r.position}`));
  }

  // direction list
  if (q.direction) {
    const moved = rows
      .filter((r) => r.position != null && r.prev_position != null && (q.direction === "up" ? (r.position as number) < (r.prev_position as number) : (r.position as number) > (r.prev_position as number)))
      .map((r) => ({ ...r, delta: Math.abs((r.prev_position ?? 0) - (r.position ?? 0)) }))
      .sort((a, b) => b.delta - a.delta);
    const icon = q.direction === "up" ? "⬆" : "⬇";
    const verb = q.direction === "up" ? "improved" : "dropped";
    if (moved.length === 0) return `${icon} No keywords ${verb}${scope} between ${prev ?? "?"} and ${latest}.`;
    return `${icon} ${moved.length} keyword${moved.length === 1 ? "" : "s"} ${verb}${scope} · ${prev ?? "?"} → ${latest}\n${bullets(moved.slice(0, 8).map((r) => `“${r.keyword}”${tag(r.country)} ${r.prev_position}→${r.position}`))}`;
  }

  // extremes
  if (q.extreme === "best") {
    const ranked = rows.filter((r) => r.position != null).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).slice(0, 5);
    if (ranked.length === 0) return `🏆 Best positions${scope}\nNothing is ranking in the top 100 yet.`;
    return `🏆 Best positions${scope} · week ${latest}\n${bullets(ranked.map((r) => `“${r.keyword}”${tag(r.country)} #${r.position}`))}`;
  }
  if (q.extreme === "worst") {
    const notRanking = rows.filter((r) => r.position == null);
    const worst = rows.filter((r) => r.position != null).sort((a, b) => (b.position ?? 0) - (a.position ?? 0)).slice(0, 5);
    const head = `📉 Weakest${scope} · week ${latest}`;
    const nr = notRanking.length ? `${notRanking.length} keyword×country not ranking at all.` : "";
    const list = worst.length ? bullets(worst.map((r) => `“${r.keyword}”${tag(r.country)} #${r.position}`)) : "";
    return [head, nr, list].filter(Boolean).join("\n");
  }

  // summary
  let top3 = 0, top10 = 0, ranked = 0, improved = 0, dropped = 0, entered = 0, lost = 0;
  let gain: { kw: string; c: string; from: number; to: number; d: number } | null = null;
  let drop: { kw: string; c: string; from: number; to: number; d: number } | null = null;
  for (const r of rows) {
    if (r.position != null) { ranked++; if (r.position <= 10) top10++; if (r.position <= 3) top3++; }
    const pp = r.position, pr = r.prev_position;
    if (pp != null && pr != null) {
      if (pp < pr) { improved++; const d = pr - pp; if (!gain || d > gain.d) gain = { kw: r.keyword, c: r.country, from: pr, to: pp, d }; }
      else if (pp > pr) { dropped++; const d = pp - pr; if (!drop || d > drop.d) drop = { kw: r.keyword, c: r.country, from: pr, to: pp, d }; }
    } else if (pp != null) entered++;
    else if (pr != null) lost++;
  }
  const lines = [
    `In top 100: ${ranked} of ${rows.length}`,
    `In top 10: ${top10}   ·   In top 3: ${top3}`,
    `Improved: ${improved}  ·  Dropped: ${dropped}  ·  New: ${entered}  ·  Fell out: ${lost}`,
  ];
  if (gain) lines.push(`⬆ Biggest gain: “${gain.kw}”${tag(gain.c)} ${gain.from}→${gain.to}`);
  if (drop) lines.push(`⬇ Biggest drop: “${drop.kw}”${tag(drop.c)} ${drop.from}→${drop.to}`);
  return `📊 Rankings${scope} · week ${latest}${prev ? ` (vs ${prev})` : ""}\n${bullets(lines)}`;
}

export function focusAnswer(q: ParsedQuery, latest: string | null, all: GridRow[]): string {
  if (!latest || all.length === 0) return "🎯 No ranking data yet, so I can't suggest keywords to focus on.";
  const rows = q.country ? all.filter((r) => r.country === q.country) : all;
  const scope = q.country ? ` · ${cname(q.country)}` : "";
  const tag = (c: string) => (q.country ? "" : ` (${cname(c)})`);
  const notRanking = rows.filter((r) => r.position == null).map((r) => ({ kw: r.keyword, c: r.country, why: "not ranking" }));
  const outside = rows.filter((r) => r.position != null && (r.position as number) > 10).sort((a, b) => (b.position ?? 0) - (a.position ?? 0)).map((r) => ({ kw: r.keyword, c: r.country, why: `#${r.position}` }));
  const picks = [...notRanking, ...outside].slice(0, 6);
  if (picks.length === 0) return `🎯 Every tracked keyword is already in the top 10${scope}. Focus on holding those positions.`;
  return `🎯 Focus on these weakest keywords${scope}:\n${bullets(picks.map((pk) => `“${pk.kw}”${tag(pk.c)} — ${pk.why}`))}\nThey're furthest from page one, so they have the most upside.`;
}

// ───────────────────────── QA pages ─────────────────────────
export function qaPagesAnswer(q: ParsedQuery, rows: QaPageRow[]): string {
  if (rows.length === 0) return "🧪 QA\nNo per-page audit data yet — sync the QA Google Sheet.";

  if (q.url) {
    const norm = (u: string | null) => (u ?? "").toLowerCase().replace(/\/+$/, "");
    const target = norm(q.url);
    const row = rows.find((r) => norm(r.url).endsWith(target) || norm(r.url).includes(target));
    if (!row) return `🧪 I don't have an audit row for “${q.url}”.`;
    return `🧪 ${row.url}\n${bullets([
      `Indexed: ${row.indexed_gsc ?? "—"}`,
      `Status: ${row.status ?? "—"}`,
      `Title: ${row.title ?? "—"}`,
      `Canonical: ${row.canonical ?? "—"}`,
      `H1s: ${row.h1_count ?? "—"}`,
      `Missing alt: ${row.images_missing_alt ?? "—"}`,
      `SEO issues: ${truthy(row.seo_issues) ? row.seo_issues : "none"}`,
      `AR issues: ${truthy(row.ar_alignment_issues) ? row.ar_alignment_issues : "none"}`,
    ])}`;
  }

  if (q.filter) {
    switch (q.filter) {
      case "not-indexed":
        return capList("🚫 Pages not indexed in GSC", rows.filter((r) => !isIndexed(r.indexed_gsc)).map((r) => r.url ?? "(no url)"));
      case "seo-issues":
        return capList("⚠️ Pages with SEO issues", rows.filter((r) => truthy(r.seo_issues)).map((r) => `${r.url ?? "(no url)"} — ${r.seo_issues}`));
      case "ar-issues":
        return capList("🔤 Pages with Arabic alignment issues", rows.filter((r) => truthy(r.ar_alignment_issues)).map((r) => `${r.url ?? "(no url)"} — ${r.ar_alignment_issues}`));
      case "missing-alt":
        return capList("🖼️ Pages with images missing alt text", rows.filter((r) => Number(r.images_missing_alt) > 0).map((r) => `${r.url ?? "(no url)"} — ${r.images_missing_alt} missing`));
      case "non-200":
        return capList("🔧 Pages not returning 200", rows.filter((r) => (r.status ?? "") !== "200").map((r) => `${r.url ?? "(no url)"} — ${r.status ?? "?"}`));
    }
  }

  // "what are the specific pages" / "list the pages" → list URLs (no specific filter).
  // Sort pages with problems first so the actionable ones surface within the cap.
  if (q.list) {
    const score = (r: QaPageRow) =>
      (!isIndexed(r.indexed_gsc) ? 4 : 0) +
      (r.status && r.status !== "200" ? 3 : 0) +
      (truthy(r.seo_issues) ? 2 : 0) +
      (truthy(r.ar_alignment_issues) ? 1 : 0);
    const line = (r: QaPageRow) => {
      const flags: string[] = [];
      if (!isIndexed(r.indexed_gsc)) flags.push("not indexed");
      if (r.status && r.status !== "200") flags.push(`status ${r.status}`);
      if (truthy(r.seo_issues)) flags.push("SEO issue");
      if (truthy(r.ar_alignment_issues)) flags.push("AR issue");
      return `${r.url ?? "(no url)"}${flags.length ? ` — ${flags.join(", ")}` : ""}`;
    };
    const sorted = [...rows].sort((a, b) => score(b) - score(a));
    const body = capList("🧪 Audited pages", sorted.map(line));
    return `${body}\nNarrow with: “which pages aren't indexed”, “pages with SEO issues”, or “pages with Arabic issues”.`;
  }

  const total = rows.length;
  const indexed = rows.filter((r) => isIndexed(r.indexed_gsc)).length;
  const live = rows.filter((r) => r.status === "200").length;
  const seo = rows.filter((r) => truthy(r.seo_issues)).length;
  const ar = rows.filter((r) => truthy(r.ar_alignment_issues)).length;
  return `🧪 QA Audit · ${total} pages\n${bullets([
    `Indexed in GSC: ${indexed} / ${total}${total - indexed > 0 ? ` (${total - indexed} not indexed)` : ""}`,
    `Live (200): ${live}`,
    ...(seo > 0 ? [`SEO issues: ${seo} pages`] : []),
    ...(ar > 0 ? [`AR alignment issues: ${ar} pages`] : []),
  ])}\nAsk “list the pages” or “which pages aren't indexed” for the specific URLs.`;
}

// ───────────────────────── whole-site checklist ─────────────────────────
const CHECK_FIELDS: { label: string; key: string; aliases: string[] }[] = [
  { label: "Schema", key: "schema", aliases: ["schema", "structured data"] },
  { label: "Sitemap (GSC)", key: "sitemap_gsc", aliases: ["sitemap"] },
  { label: "Google Analytics", key: "ga", aliases: ["google analytics", "analytics", " ga "] },
  { label: "Search Console", key: "gsc", aliases: ["search console"] },
  { label: "RankMath SEO", key: "rankmath_seo", aliases: ["rankmath"] },
  { label: "Caching", key: "caching_plugins", aliases: ["caching", "cache"] },
  { label: "Imagify", key: "imagify", aliases: ["imagify"] },
  { label: "HTML lang", key: "html_lang", aliases: ["html lang"] },
  { label: "Search engine visibility", key: "search_engine_visibility", aliases: ["search engine visibility", "visibility"] },
  { label: "Index status", key: "index_status", aliases: ["index status"] },
  { label: "Site icon", key: "site_icon", aliases: ["site icon", "favicon"] },
];

export function siteChecklistAnswer(normalizedText: string, row: SiteAuditRow | null): string {
  if (!row) return "🗂️ Site checklist\nNo whole-site QA data synced yet.";
  const generic = normalizedText.includes("checklist") || normalizedText.includes("whole site") || normalizedText.includes("whole website");
  if (!generic) {
    const hit = CHECK_FIELDS.find((f) => f.aliases.some((a) => normalizedText.includes(a)));
    if (hit) return `🗂️ ${hit.label}\n• ${truthy(row[hit.key]) ? row[hit.key] : "not set / unknown"}`;
  }
  return `🗂️ Whole-site checklist\n${bullets(CHECK_FIELDS.map((f) => `${f.label}: ${truthy(row[f.key]) ? row[f.key] : "—"}`))}`;
}

// ───────────────────────── fallback ─────────────────────────
export const CAPABILITIES =
  "I can answer questions about this dashboard's data:\n• Rankings — by country, what improved/dropped, best/worst, top-N, what's not ranking\n• Which pages aren't indexed / have SEO or Arabic issues / missing alt / are broken\n• Whole-site checklist (schema, sitemap, analytics, caching…)\n• What to focus on • Backlinks • PageSpeed (mobile vs desktop) • SEO score • Site health • Data freshness\nAsk in plain English.";

export function fallbackMessage(q: ParsedQuery): string {
  if (q.greeting) return `👋 Hi! ${CAPABILITIES}`;
  return `🤔 I'm not sure which metric you mean.\n\n${CAPABILITIES}`;
}

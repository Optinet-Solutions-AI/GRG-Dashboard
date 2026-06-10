import "server-only";

// RFC-4180-compliant CSV parser handling quoted fields with embedded newlines/commas.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuote = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuote = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuote = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ""; i++; continue; }
    if (ch === '\r' && text[i + 1] === '\n') {
      row.push(field); field = ""; rows.push(row); row = []; i += 2; continue;
    }
    if (ch === '\n') { row.push(field); field = ""; rows.push(row); row = []; i++; continue; }
    field += ch; i++;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function slugHeader(h: string): string {
  return h.toLowerCase().replace(/[\n\r]+/g, " ").replace(/\s+/g, " ").trim()
    .replace(/[^a-z0-9 ]/g, "").replace(/ +/g, "_");
}

// Maps slugged header → DB column for the per-page tab (gid=792540578)
const PAGE_COL_MAP: Record<string, string> = {
  group: "group_name",
  url: "url",
  indexed_gsc: "indexed_gsc",
  en_equivalent: "en_equivalent",
  permalink: "permalink",
  status: "status",
  lang: "lang",
  dir: "dir",
  title: "title",
  title_length: "title_length",
  meta_description: "meta_description",
  meta_length: "meta_length",
  canonical: "canonical",
  h1_count: "h1_count",
  h1: "h1",
  h2_count: "h2_count",
  h2_list: "h2_list",
  h3_count: "h3_count",
  h3_list: "h3_list",
  images_total: "images_total",
  images_with_alt: "images_with_alt",
  images_decorative_alt: "images_decorative",
  images_missing_alt: "images_missing_alt",
  missingalt_srcs: "missing_alt_srcs",
  seo_issues: "seo_issues",
  ar_alignment_issues: "ar_alignment_issues",
};

// Maps slugged header → DB column for the whole-site tab (gid=0)
const SITE_COL_MAP: Record<string, string> = {
  website: "website",
  rankmath_seo: "rankmath_seo",
  imagify: "imagify",
  caching_plugins: "caching_plugins",
  page_seo_score: "page_seo_score",
  rank_math_seo_analyzer: "rankmath_seo_analyzer",
  ahrefs_health_issue: "ahrefs_health_issue",
  gsc: "gsc",
  ga: "ga",
  page_speed_desktop: "pagespeed_desktop",
  page_speed_mobile: "pagespeed_mobile",
  meta_tags: "meta_tags",
  nofollow: "nofollow",
  html_lang: "html_lang",
  site_icon: "site_icon",
  search_engine_visibility: "search_engine_visibility",
  schema: "schema",
  fallback_behavior: "fallback_behavior",
  gen_settings_title_and_tag: "gen_settings_title_tag",
  sitemap_gsc: "sitemap_gsc",
  alt_tags_title_in_logo: "alt_tags_logo",
  twitter_data1_name: "twitter_data1_name",
  img_logo_name: "img_logo_name",
  gen_settings_content_ai: "gen_settings_content_ai",
  index: "index_status",
};

// Column order in the sheet (0-indexed) for write-back targeting
export const SITE_COL_ORDER: string[] = [
  "website", "rankmath_seo", "imagify", "caching_plugins", "page_seo_score",
  "rankmath_seo_analyzer", "ahrefs_health_issue", "gsc", "ga",
  "pagespeed_desktop", "pagespeed_mobile", "meta_tags", "nofollow",
  "html_lang", "site_icon", "search_engine_visibility", "schema",
  "fallback_behavior", "gen_settings_title_tag", "sitemap_gsc",
  "alt_tags_logo", "twitter_data1_name", "img_logo_name",
  "gen_settings_content_ai", "index_status",
];

export const SITE_FIELD_LABELS: Record<string, string> = {
  website: "Website",
  rankmath_seo: "RankMath SEO",
  imagify: "Imagify",
  caching_plugins: "Caching Plugins",
  page_seo_score: "Page SEO Score",
  rankmath_seo_analyzer: "Rank Math SEO Analyzer",
  ahrefs_health_issue: "Ahrefs (Health Issue)",
  gsc: "GSC",
  ga: "GA",
  pagespeed_desktop: "Page Speed (Desktop)",
  pagespeed_mobile: "Page Speed (Mobile)",
  meta_tags: "Meta Tags",
  nofollow: "NoFollow",
  html_lang: "html_lang",
  site_icon: "Site Icon",
  search_engine_visibility: "Search Engine Visibility",
  schema: "Schema",
  fallback_behavior: "Fallback Behavior",
  gen_settings_title_tag: "Gen Settings Title & Tag",
  sitemap_gsc: "Sitemap GSC",
  alt_tags_logo: "Alt Tags & Title in LOGO",
  twitter_data1_name: "Twitter Data1 Name",
  img_logo_name: "IMG Logo Name",
  gen_settings_content_ai: "GEN SETTINGS CONTENT AI",
  index_status: "INDEX",
};

export type PageAuditRow = Record<string, string | number>;
export type SiteAuditRow = Record<string, string | number>;

export function parsePageAuditCsv(csv: string): PageAuditRow[] {
  const all = parseCsv(csv);
  if (!all.length) return [];
  const headers = all[0].map(slugHeader);
  const results: PageAuditRow[] = [];
  for (let r = 1; r < all.length; r++) {
    const cells = all[r];
    if (!cells || cells.every((c) => !c.trim())) continue;
    const obj: PageAuditRow = { sheet_row: r + 1 };
    for (let c = 0; c < headers.length; c++) {
      const key = PAGE_COL_MAP[headers[c]];
      if (key) obj[key] = cells[c]?.trim() ?? "";
    }
    results.push(obj);
  }
  return results;
}

export function parseSiteAuditCsv(csv: string): SiteAuditRow[] {
  const all = parseCsv(csv);
  if (!all.length) return [];
  const headers = all[0].map(slugHeader);
  const results: SiteAuditRow[] = [];
  for (let r = 1; r < all.length; r++) {
    const cells = all[r];
    if (!cells || cells.every((c) => !c.trim())) continue;
    const obj: SiteAuditRow = { sheet_row: r + 1 };
    for (let c = 0; c < headers.length; c++) {
      const key = SITE_COL_MAP[headers[c]];
      if (key) obj[key] = cells[c]?.trim() ?? "";
    }
    results.push(obj);
  }
  return results;
}

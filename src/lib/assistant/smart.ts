import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseQuery, type ParsedQuery, type Topic } from "./nlu";
import { normalize } from "./text";
import {
  rankingAnswer, focusAnswer, qaPagesAnswer, siteChecklistAnswer, fallbackMessage,
  bullets, type GridRow, type QaPageRow, type SiteAuditRow,
} from "./answers";

type SB = Awaited<ReturnType<typeof createServerSupabaseClient>>;

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function resolveSite(sb: SB, siteId?: string | null): Promise<{ id: string; name: string } | null> {
  if (siteId) {
    const { data } = await sb.from("sites").select("id, display_name").eq("id", siteId).single();
    return data ? { id: data.id, name: data.display_name } : null;
  }
  const { data } = await sb.from("sites").select("id, display_name").order("sort_order").limit(1);
  const r = (data ?? [])[0] as { id: string; display_name: string } | undefined;
  return r ? { id: r.id, name: r.display_name } : null;
}

// ---------------- ranking ----------------
async function loadGrid(sb: SB, siteId: string): Promise<{ latest: string | null; prev: string | null; rows: GridRow[] }> {
  const { data: weeks } = await sb.rpc("ranking_weeks");
  const wk = ((weeks ?? []) as { week_date: string }[]).map((w) => w.week_date);
  if (wk.length === 0) return { latest: null, prev: null, rows: [] };
  const { data } = await sb.rpc("ranking_grid", { p_site_id: siteId, p_week: wk[0] });
  return { latest: wk[0], prev: wk[1] ?? null, rows: (data ?? []) as GridRow[] };
}

// ---------------- backlinks ----------------
async function backlinksAnswer(sb: SB, siteId: string): Promise<string> {
  const { data } = await sb.from("backlinks").select("date, indexed, status, source_site").eq("site_id", siteId).limit(5000);
  const rows = (data ?? []) as Array<{ date: string; indexed: string | null; status: string | null; source_site: string | null }>;
  if (rows.length === 0) return "🔗 Backlinks\nNone recorded yet — sync from the Google Sheet on the Backlinks page.";
  const total = rows.length;
  const indexed = rows.filter((r) => r.indexed && !/^(no|not)/i.test(r.indexed.trim())).length;
  const domains = new Set(rows.map((r) => r.source_site).filter(Boolean)).size;
  const month = todayLocal().slice(0, 7);
  const built = rows.filter((r) => (r.date ?? "").slice(0, 7) === month).length;
  const byStatus = new Map<string, number>();
  for (const r of rows) if (r.status) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
  const lines = [
    `Total: ${total} from ${domains} domains`,
    `Indexed: ${indexed} (${Math.round((indexed / total) * 100)}%)`,
    `Built this month: ${built}`,
  ];
  const statusStr = [...byStatus.entries()].map(([s, n]) => `${s} ${n}`).join("  ·  ");
  if (statusStr) lines.push(`By status: ${statusStr}`);
  return `🔗 Backlinks\n${bullets(lines)}`;
}

// ---------------- pagespeed ----------------
async function pagespeedAnswer(sb: SB, siteId: string, q: ParsedQuery): Promise<string> {
  const { data } = await sb
    .from("pagespeed_entries")
    .select("date, mobile_score, mobile_accessibility, mobile_best_practices, mobile_seo, desktop_score, desktop_accessibility, desktop_best_practices, desktop_seo, pagespeed_urls!inner(site_id)")
    .eq("pagespeed_urls.site_id", siteId)
    .order("date", { ascending: false })
    .limit(2);
  const rows = (data ?? []) as unknown as Array<Record<string, number | string | null>>;
  if (rows.length === 0) return "⚡ PageSpeed\nNo data has been captured yet.";
  const r = rows[0];
  const n = (v: number | string | null) => (v ?? "—");
  if (q.comparison) {
    return `⚡ PageSpeed · ${r.date} — Mobile vs Desktop\n${bullets([
      `Performance: ${n(r.mobile_score)} vs ${n(r.desktop_score)}`,
      `Accessibility: ${n(r.mobile_accessibility)} vs ${n(r.desktop_accessibility)}`,
      `Best Practices: ${n(r.mobile_best_practices)} vs ${n(r.desktop_best_practices)}`,
      `SEO: ${n(r.mobile_seo)} vs ${n(r.desktop_seo)}`,
    ])}\n(scores out of 100)`;
  }
  let trend = "";
  if (rows[1] && q.direction) {
    const cur = [r.mobile_score, r.desktop_score].filter((v): v is number => typeof v === "number");
    const prevRow = rows[1];
    const prevVals = [prevRow.mobile_score, prevRow.desktop_score].filter((v): v is number => typeof v === "number");
    if (cur.length && prevVals.length) {
      const ca = Math.round(cur.reduce((a, b) => a + b, 0) / cur.length);
      const pa = Math.round(prevVals.reduce((a, b) => a + b, 0) / prevVals.length);
      const diff = ca - pa;
      trend = `\n${diff === 0 ? "▪ Flat" : diff > 0 ? `⬆ Up ${diff}` : `⬇ Down ${Math.abs(diff)}`} vs ${prevRow.date}.`;
    }
  }
  return `⚡ PageSpeed · ${r.date}\n${bullets([
    `Mobile — Perf ${n(r.mobile_score)} · A11y ${n(r.mobile_accessibility)} · BP ${n(r.mobile_best_practices)} · SEO ${n(r.mobile_seo)}`,
    `Desktop — Perf ${n(r.desktop_score)} · A11y ${n(r.desktop_accessibility)} · BP ${n(r.desktop_best_practices)} · SEO ${n(r.desktop_seo)}`,
  ])}\n(scores out of 100)${trend}`;
}

// ---------------- seo / health ----------------
async function seoAnswer(sb: SB, siteId: string): Promise<string> {
  const { data } = await sb.from("seo_scores").select("date, seo_score, passed_tests, warnings, failed_tests").eq("site_id", siteId).order("date", { ascending: false }).limit(1);
  const r = (data ?? [])[0] as { date: string; seo_score: number | null; passed_tests: number | null; warnings: number | null; failed_tests: number | null } | undefined;
  if (!r) return "✅ SEO score\nNone recorded yet — an admin can add one on the SEO page.";
  return `✅ SEO score · ${r.date}\n${bullets([`Score: ${r.seo_score ?? "—"}/100`, `${r.passed_tests ?? 0} passed · ${r.warnings ?? 0} warnings · ${r.failed_tests ?? 0} failed`])}`;
}

async function healthAnswer(sb: SB, siteId: string): Promise<string> {
  const { data } = await sb.from("health_snapshots").select("date, domain_rating, referring_domains, organic_traffic, organic_keywords").eq("site_id", siteId).order("date", { ascending: false }).limit(1);
  const r = (data ?? [])[0] as { date: string; domain_rating: number | null; referring_domains: number | null; organic_traffic: number | null; organic_keywords: number | null } | undefined;
  if (!r) return "📈 Site health\nNo snapshot recorded yet.";
  return `📈 Site health · ${r.date}\n${bullets([
    `Domain Rating: ${r.domain_rating ?? "—"}`,
    `Referring domains: ${r.referring_domains ?? "—"}`,
    `Organic traffic: ${r.organic_traffic ?? "—"}`,
    `Organic keywords: ${r.organic_keywords ?? "—"}`,
  ])}`;
}

// ---------------- qa pages / site checklist ----------------
async function loadQaPages(sb: SB, siteId: string): Promise<QaPageRow[]> {
  const { data } = await sb
    .from("qa_page_audit")
    .select("url, indexed_gsc, status, seo_issues, ar_alignment_issues, images_missing_alt, title, meta_description, canonical, h1_count, lang")
    .eq("site_id", siteId);
  return (data ?? []) as QaPageRow[];
}

async function loadSiteAudit(sb: SB, siteId: string): Promise<SiteAuditRow | null> {
  const { data } = await sb.from("qa_site_audit").select("*").eq("site_id", siteId).maybeSingle();
  return (data ?? null) as SiteAuditRow | null;
}

// ---------------- freshness ----------------
async function maxDate(sb: SB, table: string, col: string): Promise<string | null> {
  const { data } = await sb.from(table).select(col).order(col, { ascending: false }).limit(1);
  const row = (data ?? [])[0] as unknown as Record<string, string> | undefined;
  return row ? (row[col] ?? null) : null;
}

async function freshnessAnswer(sb: SB): Promise<string> {
  const today = todayLocal();
  const sections: { name: string; latest: string | null }[] = [
    { name: "SEO", latest: await maxDate(sb, "seo_scores", "date") },
    { name: "Health", latest: await maxDate(sb, "health_snapshots", "date") },
    { name: "PageSpeed", latest: await maxDate(sb, "pagespeed_entries", "date") },
    { name: "Ranking", latest: await maxDate(sb, "rankings", "week_date") },
    { name: "Backlinks", latest: await maxDate(sb, "backlinks", "date") },
  ];
  const days = (d: string) => Math.floor((Date.parse(today) - Date.parse(d)) / 86400000);
  const stale = sections.filter((s) => !s.latest || days(s.latest) > 14).map((s) => `${s.name} — ${s.latest ? `${days(s.latest)} days old` : "no data"}`);
  if (stale.length === 0) return "🕒 Data freshness\nAll sections updated within the last 14 days — nothing stale.";
  return `🕒 Stale or missing (14+ days)\n${bullets(stale)}`;
}

/** Tokenless smart answer: parse the question, then compute the answer from live data. */
export async function smartAnswer(question: string, siteId?: string | null): Promise<string> {
  const sb = await createServerSupabaseClient();
  const site = await resolveSite(sb, siteId);
  if (!site) return "No sites are configured in the dashboard yet.";

  const [{ data: ctys }, { data: kws }] = await Promise.all([
    sb.from("countries").select("code"),
    sb.from("keywords").select("text"),
  ]);
  const vocab = {
    countryCodes: ((ctys ?? []) as { code: string }[]).map((c) => c.code),
    keywords: ((kws ?? []) as { text: string }[]).map((k) => k.text),
  };

  const q = parseQuery(question, vocab);
  if (q.topics.length === 0) return fallbackMessage(q);

  const normalized = normalize(question);
  let topics = q.topics;

  // "what should I focus on" alone shouldn't also dump a full ranking summary.
  if (topics.includes("focus") && topics.includes("ranking") && !q.country && !q.direction && !q.extreme && !q.keyword && !q.threshold && !q.notRanking) {
    topics = topics.filter((t) => t !== "ranking");
  }
  // A page-level QA question (filter/url) shouldn't also fire the broad ranking catch-all.
  const qaPageLevel = topics.includes("qa") && (q.filter !== null || q.url !== null);
  if (qaPageLevel) topics = topics.filter((t) => t !== "ranking");
  // "indexed" lives in both QA and backlinks vocab — drop a non-concrete QA tag when
  // another topic is present and the user didn't actually ask about pages.
  const mentionsPage = normalized.includes("page") || normalized.includes(" qa ");
  const qaConcrete = q.filter !== null || q.url !== null || mentionsPage;
  if (topics.includes("qa") && !qaConcrete && topics.length > 1) topics = topics.filter((t) => t !== "qa");

  const needsGrid = topics.includes("ranking") || topics.includes("focus");
  const grid = needsGrid ? await loadGrid(sb, site.id) : null;

  const parts: string[] = [];
  for (const topic of topics as Topic[]) {
    switch (topic) {
      case "ranking": parts.push(rankingAnswer(q, grid!.latest, grid!.prev, grid!.rows)); break;
      case "focus": parts.push(focusAnswer(q, grid!.latest, grid!.rows)); break;
      case "backlinks": parts.push(await backlinksAnswer(sb, site.id)); break;
      case "pagespeed": parts.push(await pagespeedAnswer(sb, site.id, q)); break;
      case "seo": parts.push(await seoAnswer(sb, site.id)); break;
      case "health": parts.push(await healthAnswer(sb, site.id)); break;
      case "qa": parts.push(qaPagesAnswer(q, await loadQaPages(sb, site.id))); break;
      case "checklist": parts.push(siteChecklistAnswer(normalized, await loadSiteAudit(sb, site.id))); break;
      case "freshness": parts.push(await freshnessAnswer(sb)); break;
    }
  }
  return parts.join("\n\n");
}

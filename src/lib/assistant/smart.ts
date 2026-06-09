import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseQuery, type ParsedQuery, type Topic } from "./nlu";

type SB = Awaited<ReturnType<typeof createServerSupabaseClient>>;
type GridRow = { keyword: string; country: string; position: number | null; prev_position: number | null };

const COUNTRY_NAME: Record<string, string> = { SA: "Saudi Arabia", AE: "UAE", QA: "Qatar", OM: "Oman", KW: "Kuwait", BH: "Bahrain" };
const cname = (code: string) => COUNTRY_NAME[code] ?? code;
const bullets = (items: string[]) => items.map((i) => `• ${i}`).join("\n");

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

function rankingAnswer(q: ParsedQuery, latest: string | null, prev: string | null, all: GridRow[]): string {
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

  // direction list
  if (q.direction) {
    const moved = rows
      .filter((r) => r.position != null && r.prev_position != null && (q.direction === "up" ? r.position < r.prev_position : r.position > r.prev_position))
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
    const p = r.position, pr = r.prev_position;
    if (p != null && pr != null) {
      if (p < pr) { improved++; const d = pr - p; if (!gain || d > gain.d) gain = { kw: r.keyword, c: r.country, from: pr, to: p, d }; }
      else if (p > pr) { dropped++; const d = p - pr; if (!drop || d > drop.d) drop = { kw: r.keyword, c: r.country, from: pr, to: p, d }; }
    } else if (p != null) entered++;
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

function focusAnswer(q: ParsedQuery, latest: string | null, all: GridRow[]): string {
  if (!latest || all.length === 0) return "🎯 No ranking data yet, so I can't suggest keywords to focus on.";
  const rows = q.country ? all.filter((r) => r.country === q.country) : all;
  const scope = q.country ? ` · ${cname(q.country)}` : "";
  const tag = (c: string) => (q.country ? "" : ` (${cname(c)})`);
  const notRanking = rows.filter((r) => r.position == null).map((r) => ({ kw: r.keyword, c: r.country, why: "not ranking" }));
  const outside = rows.filter((r) => r.position != null && r.position > 10).sort((a, b) => (b.position ?? 0) - (a.position ?? 0)).map((r) => ({ kw: r.keyword, c: r.country, why: `#${r.position}` }));
  const picks = [...notRanking, ...outside].slice(0, 6);
  if (picks.length === 0) return `🎯 Every tracked keyword is already in the top 10${scope}. Focus on holding those positions.`;
  return `🎯 Focus on these weakest keywords${scope}:\n${bullets(picks.map((p) => `“${p.kw}”${tag(p.c)} — ${p.why}`))}\nThey're furthest from page one, so they have the most upside.`;
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

// ---------------- seo / health / qa / freshness ----------------
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

async function qaAnswer(sb: SB, siteId: string): Promise<string> {
  const { count } = await sb.from("qa_pages").select("id", { count: "exact", head: true }).eq("site_id", siteId);
  return `🧪 QA\n${count ?? 0} pages are crawled and tracked in the brand-protection checklist.`;
}

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

const CAPABILITIES =
  "I can answer questions about this dashboard's data:\n• Rankings — overall, by country (Saudi/UAE/Kuwait/Qatar/Bahrain/Oman), what improved/dropped, best/worst keywords\n• What to focus on\n• Backlinks\n• PageSpeed (incl. mobile vs desktop)\n• SEO score, site health, QA pages, and which data is stale\nAsk in plain English.";

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

  if (q.topics.length === 0) {
    if (q.greeting) return `👋 Hi! ${CAPABILITIES}`;
    return `🤔 I'm not sure which metric you mean.\n\n${CAPABILITIES}`;
  }

  let topics = q.topics;
  if (topics.includes("focus") && topics.includes("ranking") && !q.country && !q.direction && !q.extreme && !q.keyword) {
    topics = topics.filter((t) => t !== "ranking");
  }

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
      case "qa": parts.push(await qaAnswer(sb, site.id)); break;
      case "freshness": parts.push(await freshnessAnswer(sb)); break;
    }
  }
  return parts.join("\n\n");
}

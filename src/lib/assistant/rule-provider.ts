import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AssistantContext, InsightProvider, QuestionId } from "./types";
import {
  topRankingMover,
  staleSections,
  trendDirection,
  type RankMoveRow,
  type SectionFreshness,
  type ScorePoint,
} from "./insights";

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type SB = Awaited<ReturnType<typeof createServerSupabaseClient>>;

async function maxDate(sb: SB, table: string, col: string): Promise<string | null> {
  const { data } = await sb.from(table).select(col).order(col, { ascending: false }).limit(1);
  const row = (data ?? [])[0] as unknown as Record<string, string> | undefined;
  return row ? (row[col] ?? null) : null;
}

async function answerTopMover(sb: SB): Promise<string> {
  const { data: weeks } = await sb.rpc("ranking_weeks");
  const wk = (weeks ?? []) as { week_date: string }[];
  if (wk.length < 2) return "Not enough ranking history yet — add at least two weeks to compare.";
  const [latest, prev] = [wk[0].week_date, wk[1].week_date];
  const { data } = await sb
    .from("rankings")
    .select("week_date, position, site_id, country_id, keyword_id, sites!inner(display_name)")
    .in("week_date", [latest, prev]);
  const rows = (data ?? []) as unknown as Array<{
    week_date: string; position: number | null; site_id: string; country_id: string;
    keyword_id: string; sites: { display_name: string };
  }>;
  const pair = new Map<string, { site: string; latest: number | null; prev: number | null }>();
  for (const r of rows) {
    const k = `${r.site_id}|${r.country_id}|${r.keyword_id}`;
    const e = pair.get(k) ?? { site: r.sites.display_name, latest: null, prev: null };
    if (r.week_date === latest) e.latest = r.position;
    else e.prev = r.position;
    pair.set(k, e);
  }
  const moveRows: RankMoveRow[] = [...pair.values()].map((e) => ({
    site: e.site, position: e.latest, prevPosition: e.prev,
  }));
  const best = topRankingMover(moveRows);
  if (!best || best.net <= 0) return `Between ${prev} and ${latest}, no site showed a clear net improvement.`;
  return `Between ${prev} and ${latest}, “${best.site}” improved the most (net ${best.net} keyword position gain${best.net === 1 ? "" : "s"}).`;
}

async function answerStale(sb: SB): Promise<string> {
  const today = todayLocal();
  const rows: SectionFreshness[] = [
    { section: "SEO", latest: await maxDate(sb, "seo_scores", "date") },
    { section: "Health", latest: await maxDate(sb, "health_snapshots", "date") },
    { section: "PageSpeed", latest: await maxDate(sb, "pagespeed_entries", "date") },
    { section: "Ranking", latest: await maxDate(sb, "rankings", "week_date") },
    { section: "Backlinks", latest: await maxDate(sb, "backlinks", "date") },
  ];
  const stale = staleSections(rows, today, 14);
  if (stale.length === 0) return "All sections have data updated within the last 14 days. Nothing stale.";
  return `These sections are missing or stale (no update in 14+ days): ${stale.join(", ")}.`;
}

async function answerPageSpeedTrend(sb: SB): Promise<string> {
  const { data } = await sb
    .from("pagespeed_entries")
    .select("date, mobile_score, desktop_score")
    .order("date", { ascending: false })
    .limit(200);
  const byDate = new Map<string, { sum: number; n: number }>();
  for (const r of (data ?? []) as Array<{ date: string; mobile_score: number | null; desktop_score: number | null }>) {
    const vals = [r.mobile_score, r.desktop_score].filter((v): v is number => typeof v === "number");
    if (vals.length === 0) continue;
    const acc = byDate.get(r.date) ?? { sum: 0, n: 0 };
    acc.sum += vals.reduce((a, b) => a + b, 0);
    acc.n += vals.length;
    byDate.set(r.date, acc);
  }
  const points: ScorePoint[] = [...byDate.entries()].map(([date, a]) => ({ date, score: Math.round(a.sum / a.n) }));
  const t = trendDirection(points);
  if (t.dir === "n/a") return "Not enough PageSpeed history to compare periods yet.";
  if (t.dir === "flat") return "PageSpeed is flat versus the previous period (no change in the average score).";
  return `PageSpeed is ${t.dir} ${Math.abs(t.delta ?? 0)} point${Math.abs(t.delta ?? 0) === 1 ? "" : "s"} versus the previous period (average mobile+desktop).`;
}

async function answerHealthSummary(sb: SB, siteId?: string | null): Promise<string> {
  let q = sb
    .from("health_snapshots")
    .select("date, domain_rating, referring_domains, organic_traffic, organic_keywords, site_id, sites!inner(display_name)")
    .order("date", { ascending: false })
    .limit(1);
  if (siteId) q = q.eq("site_id", siteId);
  const { data } = await q;
  const r = (data ?? [])[0] as unknown as
    | { date: string; domain_rating: number | null; referring_domains: number | null; organic_traffic: number | null; organic_keywords: number | null; sites: { display_name: string } }
    | undefined;
  if (!r) return "No health snapshot recorded yet.";
  return `Latest health for “${r.sites.display_name}” (${r.date}): DR ${r.domain_rating ?? "—"}, ${r.referring_domains ?? "—"} referring domains, ${r.organic_traffic ?? "—"} organic traffic, ${r.organic_keywords ?? "—"} organic keywords.`;
}

export const ruleProvider: InsightProvider = {
  id: "rule",
  async answer(questionId: QuestionId, ctx: AssistantContext): Promise<string> {
    const sb = await createServerSupabaseClient();
    switch (questionId) {
      case "top-mover-week": return answerTopMover(sb);
      case "missing-or-stale": return answerStale(sb);
      case "pagespeed-trend": return answerPageSpeedTrend(sb);
      case "health-summary": return answerHealthSummary(sb, ctx.siteId);
      default: return "I don't have an answer for that question.";
    }
  },
};

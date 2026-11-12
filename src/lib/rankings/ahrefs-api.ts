import "server-only";

/**
 * Read the client's Ahrefs Rank Tracker directly, instead of waiting for someone to export
 * a CSV and a folder-watcher on an office machine to notice it.
 *
 * That export chain is why rankings have been thinner and later than Ahrefs' own data: the
 * 2026-11-11 export carried 17 keywords to the dashboard where the project holds 30, and
 * .com landed in a different week from .org/.net because each export stamped its own date.
 *
 * Three endpoints, all GET, none of which Ahrefs charges API units for:
 *   management/projects              — which projects the key can see
 *   rank-tracker/competitors-overview — every slot's position, ours and the competitors'
 *
 * The key reads the whole agency workspace, so a project is only ever read when its target
 * host matches a site this dashboard tracks.
 */
export const AHREFS_API_BASE = "https://api.ahrefs.com/v3";

/** Every slot's current and previous position, in one call per project. */
const SELECT = "keyword,location,country,language,serp_updated,serp_updated_prev,competitors_list";
const ROW_LIMIT = 1000;
const REQUEST_TIMEOUT_MS = 25_000;

export type AhrefsProject = { project_id: number; project_name?: string; url?: string };
export type CompetitorEntry = { url: string | null; position: number | null; position_prev: number | null };
export type AhrefsKeywordRow = {
  keyword?: string | null;
  country?: string | null;
  serp_updated?: string | null;
  competitors_list?: CompetitorEntry[] | null;
};
export type RankingRow = { keyword: string; countryCode: string; position: number | null; previous: number | null };

export class AhrefsError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "AhrefsError";
    this.status = status;
  }
}

/** Host of a URL that may arrive bare ("example.com/"), schemed, or with www. */
function hostOf(url: string | null | undefined): string {
  const s = String(url ?? "").trim().toLowerCase();
  if (!s) return "";
  const withScheme = s.includes("://") ? s : `https://${s}`;
  try {
    return new URL(withScheme).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Our own position in a slot.
 *
 * Picked by host rather than by taking the first entry: competitors_list is the project's
 * competitor set and its order is Ahrefs' business, so trusting position 0 would eventually
 * publish a rival's ranking as the client's own.
 */
export function ourPosition(row: AhrefsKeywordRow, siteHost: string): { position: number | null; previous: number | null } {
  const want = hostOf(siteHost);
  const mine = (row.competitors_list ?? []).find((c) => hostOf(c?.url) === want);
  return { position: mine?.position ?? null, previous: mine?.position_prev ?? null };
}

export function toRankingRows(rows: AhrefsKeywordRow[], siteHost: string): RankingRow[] {
  const out: RankingRow[] = [];
  for (const r of rows ?? []) {
    const keyword = String(r?.keyword ?? "").trim();
    const countryCode = String(r?.country ?? "").trim().toUpperCase();
    if (!keyword || !countryCode) continue;
    const { position, previous } = ourPosition(r, siteHost);
    out.push({ keyword, countryCode, position, previous });
  }
  return out;
}

/**
 * The week this data belongs to: Ahrefs' own most recent SERP update, not the day we asked.
 * A Thursday retry after a failed Wednesday therefore lands on the same week the Wednesday
 * would have, instead of opening a second week for one sweep.
 */
export function weekOf(rows: AhrefsKeywordRow[]): string | null {
  const dates = (rows ?? []).map((r) => String(r?.serp_updated ?? "").slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  return dates.length ? dates.sort().at(-1)! : null;
}

export function projectForDomain(projects: AhrefsProject[], domain: string): AhrefsProject | null {
  const want = hostOf(domain);
  return (projects ?? []).find((p) => hostOf(p?.url) === want) ?? null;
}

async function getJson(path: string, params: Record<string, string>, key: string, fetchImpl: typeof fetch): Promise<unknown> {
  const url = new URL(`${AHREFS_API_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetchImpl(url.toString(), {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  const body = await res.text();
  if (res.status === 401 || res.status === 403) {
    // Worded for whoever reads the cron log; never includes the key or the URL.
    throw new AhrefsError("Ahrefs rejected the key — check AHREFS_API_KEY (expired, revoked, or its creator left the workspace).", res.status);
  }
  if (!res.ok) throw new AhrefsError(`Ahrefs ${path} returned HTTP ${res.status}: ${body.slice(0, 200)}`, res.status);
  try {
    return JSON.parse(body);
  } catch {
    throw new AhrefsError(`Ahrefs ${path} returned a non-JSON body.`, res.status);
  }
}

export async function listProjects(key: string, opts: { fetchImpl?: typeof fetch } = {}): Promise<AhrefsProject[]> {
  const data = (await getJson("management/projects", {}, key, opts.fetchImpl ?? fetch)) as { projects?: AhrefsProject[] };
  return data?.projects ?? [];
}

/** One call per project: every slot, with our position and the previous one. */
export async function fetchProjectRankings(
  key: string,
  projectId: number,
  date: string,
  dateCompared: string,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<AhrefsKeywordRow[]> {
  const data = (await getJson(
    "rank-tracker/competitors-overview",
    {
      project_id: String(projectId),
      device: "desktop",
      date,
      date_compared: dateCompared,
      select: SELECT,
      limit: String(ROW_LIMIT),
    },
    key,
    opts.fetchImpl ?? fetch,
  )) as { keywords?: AhrefsKeywordRow[] };
  return data?.keywords ?? [];
}

/** 7 days before `asOf`, which is what "previous" means on a weekly cycle. */
export function compareDate(asOf: string): string {
  const d = new Date(`${asOf}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

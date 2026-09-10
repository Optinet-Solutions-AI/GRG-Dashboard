import "server-only";
import { extractFacts, type PageFacts } from "./extract";
import { runChecks, type Check, type SiteContext } from "./checks";
import { scoreChecks, type Scored } from "./score";

export type Analysis = {
  url: string;
  analyzedAt: string;
  facts: PageFacts;
  checks: Check[];
  score: Scored;
};

// A self-identifying agent, not a spoofed browser — and NOT the bare "Mozilla/5.0" that
// looks like a truncated string: the origin's mod_security answers that exact value with
// 406 Not Acceptable on both sites, which would otherwise be scored as an error page
// showing every test failing.
const UA = "GRG-Dashboard-SEO-Analyzer/1.0 (+https://grg-dashboard.vercel.app)";
const HEADERS = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ar,en;q=0.8",
};
const TIMEOUT_MS = 15_000;

type Fetched = { status: number; body: string; headers: Headers; ms: number };

// Keep the reason a fetch failed. Reporting every failure as a timeout (which an earlier
// version did) sends whoever reads the error hunting a slow server when the real cause was
// DNS, TLS or a blocked request.
async function get(url: string): Promise<{ res: Fetched; error: null } | { res: null; error: string }> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return {
      res: { status: res.status, body: await res.text(), headers: res.headers, ms: Date.now() - started },
      error: null,
    };
  } catch (e) {
    const elapsed = Date.now() - started;
    const name = e instanceof Error ? e.name : "";
    const message = e instanceof Error ? e.message : String(e);
    return {
      res: null,
      error:
        name === "TimeoutError" || name === "AbortError"
          ? `no response within ${TIMEOUT_MS / 1000}s`
          : `${message || name || "fetch failed"} (after ${elapsed}ms)`,
    };
  }
}

function parseRobots(body: string): { blocksAll: boolean; sitemaps: string[] } {
  const sitemaps: string[] = [];
  let blocksAll = false;
  let appliesToAll = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [keyRaw, ...rest] = line.split(":");
    const key = keyRaw.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "sitemap" && value) sitemaps.push(value);
    if (key === "user-agent") appliesToAll = value === "*";
    // Only "Disallow: /" under a wildcard agent blocks the site; a Disallow on a path
    // (or one aimed at a single bot) is normal housekeeping, not a site-wide block.
    if (key === "disallow" && appliesToAll && value === "/") blocksAll = true;
  }
  return { blocksAll, sitemaps };
}

/**
 * Fetch a URL and score it.
 *
 * Refuses to score a bad fetch instead of reporting a catastrophic result: a 406, a 500 or
 * a body with no markup produces an error, never a row of failed tests. Same principle as
 * the ranking importer declining a broken sweep — a wrong number on the dashboard is worse
 * than a missing one.
 */
export async function analyzeUrl(url: string): Promise<Analysis> {
  const fetched = await get(url);
  if (!fetched.res) throw new Error(`${url} could not be fetched: ${fetched.error}`);
  const page = fetched.res;
  if (page.status !== 200) {
    throw new Error(`${url} returned HTTP ${page.status} — not scoring an error page`);
  }
  if (!/<html[\s>]/i.test(page.body) || page.body.length < 500) {
    throw new Error(`${url} returned ${page.body.length} bytes with no <html> — nothing to analyze`);
  }

  const origin = new URL(url).origin;
  const robotsRes = (await get(`${origin}/robots.txt`)).res;
  // A site that serves its SPA shell for /robots.txt has no robots.txt, whatever the
  // status code says — so require something that isn't HTML.
  const robotsOk = Boolean(robotsRes && robotsRes.status === 200 && !/<html[\s>]/i.test(robotsRes.body));
  const robotsParsed = robotsOk ? parseRobots(robotsRes!.body) : { blocksAll: false, sitemaps: [] };

  // Prefer the sitemap robots.txt declares — .org publishes /urls.xml, not /sitemap.xml,
  // so probing the conventional path alone would report "no sitemap".
  const candidates = [...robotsParsed.sitemaps, `${origin}/sitemap.xml`];
  let sitemap: { found: boolean; urlCount: number | null } = { found: false, urlCount: null };
  for (const candidate of candidates) {
    const res = (await get(candidate)).res;
    if (res && res.status === 200 && /<(urlset|sitemapindex)\b/i.test(res.body)) {
      sitemap = { found: true, urlCount: (res.body.match(/<loc>/gi) ?? []).length || null };
      break;
    }
  }

  const facts = extractFacts(page.body, url);
  const ctx: SiteContext = {
    url,
    httpStatus: page.status,
    https: url.startsWith("https://"),
    robots: { found: robotsOk, blocksAll: robotsParsed.blocksAll, sitemaps: robotsParsed.sitemaps },
    sitemap,
    headers: {
      contentEncoding: page.headers.get("content-encoding"),
      hsts: Boolean(page.headers.get("strict-transport-security")),
      xRobotsTag: page.headers.get("x-robots-tag"),
    },
    responseMs: page.ms,
  };

  const checks = runChecks(facts, ctx);
  return { url, analyzedAt: new Date().toISOString(), facts, checks, score: scoreChecks(checks) };
}

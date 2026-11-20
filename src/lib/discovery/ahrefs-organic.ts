import "server-only";
import { AHREFS_API_BASE } from "@/lib/rankings/ahrefs-api";
import { DISCOVERY_SELECT, ROWS_PER_CALL, overcharged } from "./cost";

/**
 * Ahrefs Site Explorer → organic keywords. THIS SPENDS API UNITS.
 *
 * Its neighbour `rankings/ahrefs-api.ts` is built never to: the rankings sync uses only
 * endpoints Ahrefs serves free. This one is the exception, and it runs against the same key,
 * whose monthly cap the rankings sync depends on. So every response's actual charge is read
 * back from Ahrefs' own header and checked against what its rows can explain — if Ahrefs
 * changes its pricing, the run stops rather than draining the key quietly.
 *
 * Read the `-actual` header, never `x-api-units-cost-total`: on Ahrefs' free test targets the
 * nominal header reports a full price while nothing is charged, so a guard reading the nominal
 * one would refuse work that is free and trust work that is not.
 */
export class DiscoveryError extends Error {
  readonly status: number | null;
  /** Set when Ahrefs charged more than the rows explain: stop everything until a person looks. */
  readonly halt: boolean;
  constructor(message: string, opts: { status?: number | null; halt?: boolean } = {}) {
    super(message);
    this.name = "DiscoveryError";
    this.status = opts.status ?? null;
    this.halt = opts.halt ?? false;
  }
}

export type OrganicCall = {
  rows: Array<Record<string, unknown>>;
  unitsCharged: number;
};

const REQUEST_TIMEOUT_MS = 20_000;

/** One market of one site. `date` is today: Site Explorer reports what it knows as of then. */
export async function organicKeywords(
  key: string,
  args: { target: string; country: string; date: string; limit?: number },
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<OrganicCall> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const limit = args.limit ?? ROWS_PER_CALL;
  const url = new URL(`${AHREFS_API_BASE}/site-explorer/organic-keywords`);
  url.searchParams.set("target", args.target);
  url.searchParams.set("country", args.country.toLowerCase());
  url.searchParams.set("date", args.date);
  url.searchParams.set("select", DISCOVERY_SELECT);
  // Highest search volume first: the point is the keywords worth having, not the longest tail.
  url.searchParams.set("order_by", "volume:desc");
  url.searchParams.set("limit", String(limit));

  const res = await fetchImpl(url.toString(), {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  const body = await res.text();
  const unitsCharged = Number(res.headers.get("x-api-units-cost-total-actual") ?? 0) || 0;

  if (res.status === 401 || res.status === 403) {
    throw new DiscoveryError(
      "Ahrefs rejected the key for Site Explorer — check AHREFS_API_KEY (it may lack Site Explorer access, or have expired).",
      { status: res.status },
    );
  }
  if (res.status === 429) {
    throw new DiscoveryError("Ahrefs rate-limited the discovery pull (60 requests a minute).", { status: 429 });
  }
  if (!res.ok) {
    throw new DiscoveryError(`Ahrefs organic-keywords returned HTTP ${res.status}: ${body.slice(0, 200)}`, { status: res.status });
  }

  let parsed: { keywords?: Array<Record<string, unknown>> };
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new DiscoveryError("Ahrefs organic-keywords returned a non-JSON body.", { status: res.status, halt: true });
  }
  const rows = parsed?.keywords ?? [];

  if (overcharged(unitsCharged, rows.length)) {
    throw new DiscoveryError(
      `Ahrefs charged ${unitsCharged} units for ${rows.length} rows, more than its published pricing explains. Stopping before the next call — check whether Ahrefs changed what these fields cost.`,
      { status: res.status, halt: true },
    );
  }

  return { rows, unitsCharged };
}

/** The key's remaining allowance, from an endpoint Ahrefs serves free. */
export async function keyAllowance(
  key: string,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<{ limit: number; used: number } | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`${AHREFS_API_BASE}/subscription-info/limits-and-usage`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { limits_and_usage?: { units_limit_api_key?: number; units_usage_api_key?: number } };
    const u = d?.limits_and_usage;
    if (!u || typeof u.units_limit_api_key !== "number") return null;
    return { limit: u.units_limit_api_key, used: u.units_usage_api_key ?? 0 };
  } catch {
    return null;
  }
}

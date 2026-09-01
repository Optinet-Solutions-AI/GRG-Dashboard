// Thin typed client for the BPN Ranks API (see BPN_API.md at the project root).
//
// Position normalization happens HERE, at the boundary, so no downstream caller can
// forget that this API reports "not ranking" as integer 0 rather than null.

import { normalizePosition, type BpnRow } from "./bpn-week";

const PAGE_LIMIT = 1000; // API maximum

export type BpnDomain = {
  domain: string;
  keyword_count: number;
  last_checked: string | null;
  project_id: number;
};

type RawRow = Omit<BpnRow, "position"> & { position: number | null };
type Envelope<T> = { ok: boolean; error?: string; code?: number; meta?: { total?: number }; data?: T };

export type BpnClient = {
  domains: () => Promise<BpnDomain[]>;
  history: (q: { domain: string; from: string; to: string }) => Promise<BpnRow[]>;
};

export function createBpnClient(opts: {
  baseUrl?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}): BpnClient {
  const baseUrl = opts.baseUrl ?? process.env.BPN_API_BASE;
  const apiKey = opts.apiKey ?? process.env.SITES_API_KEY;
  const doFetch = opts.fetchImpl ?? fetch;
  if (!baseUrl) throw new Error("BPN_API_BASE is not set");
  if (!apiKey) throw new Error("SITES_API_KEY is not set");

  async function call<T>(params: Record<string, string>): Promise<T[]> {
    const url = new URL(baseUrl!);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    // Key travels in the header, not the query string, so it stays out of access logs.
    const res = await doFetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    const body = (await res.json()) as Envelope<T[]>;
    if (!body.ok) {
      throw new Error(`BPN API ${body.code ?? res.status}: ${body.error ?? "request failed"}`);
    }
    return body.data ?? [];
  }

  return {
    domains: () => call<BpnDomain>({ action: "domains", limit: String(PAGE_LIMIT) }),

    async history({ domain, from, to }) {
      // history returns one row per individual check, so a multi-week window for 144
      // tracked pairs overruns the 1000-row cap — page until a short page comes back.
      const out: BpnRow[] = [];
      for (let offset = 0; ; offset += PAGE_LIMIT) {
        const page = await call<RawRow>({
          action: "history",
          domain,
          from,
          to,
          limit: String(PAGE_LIMIT),
          offset: String(offset),
        });
        out.push(...page.map((r) => ({ ...r, position: normalizePosition(r.position) })));
        if (page.length < PAGE_LIMIT) break;
      }
      return out;
    },
  };
}

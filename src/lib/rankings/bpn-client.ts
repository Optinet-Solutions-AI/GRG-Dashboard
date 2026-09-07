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

export type SweepRun = {
  run_id: number;
  status: string; // queued | running | complete | already_running
  total_jobs?: number;
  done?: number;
  failed?: number;
  pending?: number;
  processing?: number;
  created_at?: string;
  completed_at?: string | null;
  message?: string;
};

export type BpnClient = {
  domains: () => Promise<BpnDomain[]>;
  history: (q: { domain: string; from: string; to: string }) => Promise<BpnRow[]>;
  triggerSweep: (q: { projectId: number }) => Promise<SweepRun>;
  runStatus: (runId: number) => Promise<SweepRun>;
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

  // Envelope-level call for the actions that answer with top-level fields (run_id,
  // status, …) instead of a `data` array.
  async function callOne<T extends object>(
    params: Record<string, string>,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = new URL(baseUrl!);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await doFetch(url.toString(), {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const env = (await res.json()) as Envelope<unknown> & Record<string, unknown>;
    if (!env.ok) {
      throw new Error(`BPN API ${env.code ?? res.status}: ${env.error ?? "request failed"}`);
    }
    return env as unknown as T;
  }

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

    // Queues a full project rank check. The `action` MUST travel in the POST body:
    // sent as a query param the endpoint ignores it and silently answers with a
    // `results` payload instead (looks like ok:true, queues nothing).
    // Safe to call repeatedly — a run already in progress is returned as
    // status "already_running" with its existing run_id rather than duplicated.
    triggerSweep: ({ projectId }) =>
      callOne<SweepRun>({}, { action: "check_all", project_id: projectId }),

    runStatus: (runId) => callOne<SweepRun>({ action: "run_status", run_id: String(runId) }),
  };
}

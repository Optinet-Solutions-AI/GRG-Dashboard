import { describe, it, expect } from "vitest";
import { createBpnClient } from "./bpn-client";

// A real function standing in for fetch — no mocking library, so what we assert is
// the client's own request-building and response-mapping behaviour.
function stubFetch(payload: unknown, status = 200) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const impl = async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, headers: init?.headers ?? {} });
    return { ok: status < 400, status, json: async () => payload } as Response;
  };
  return { impl: impl as unknown as typeof fetch, calls };
}

const client = (f: typeof fetch) =>
  createBpnClient({ baseUrl: "https://api.test/ranks.php", apiKey: "bpn_test", fetchImpl: f });

describe("createBpnClient", () => {
  it("folds the API's position 0 into null for history rows", async () => {
    const { impl } = stubFetch({
      ok: true, meta: { total: 2 },
      data: [
        { domain: "d.com", keyword: "k1", country: "SA", language: "ar", position: 0, checked_at: "2026-09-01 05:00:00" },
        { domain: "d.com", keyword: "k2", country: "SA", language: "ar", position: 4, checked_at: "2026-09-01 05:00:00" },
      ],
    });
    const rows = await client(impl).history({ domain: "d.com", from: "2026-08-31", to: "2026-09-06" });
    expect(rows.map((r) => r.position)).toEqual([null, 4]);
  });

  it("sends the key as a Bearer header, never in the URL", async () => {
    const { impl, calls } = stubFetch({ ok: true, data: [] });
    await client(impl).history({ domain: "d.com", from: "2026-08-31", to: "2026-09-06" });
    expect(calls[0].headers.Authorization).toBe("Bearer bpn_test");
    expect(calls[0].url).not.toContain("bpn_test");
  });

  it("passes the date window and domain through as query params", async () => {
    const { impl, calls } = stubFetch({ ok: true, data: [] });
    await client(impl).history({ domain: "d.com", from: "2026-08-31", to: "2026-09-06" });
    const u = new URL(calls[0].url);
    expect(u.searchParams.get("action")).toBe("history");
    expect(u.searchParams.get("domain")).toBe("d.com");
    expect(u.searchParams.get("from")).toBe("2026-08-31");
    expect(u.searchParams.get("to")).toBe("2026-09-06");
  });

  it("surfaces the API's own error message when ok is false", async () => {
    const { impl } = stubFetch({ ok: false, error: "Invalid or revoked API key.", code: 401 }, 401);
    await expect(client(impl).history({ domain: "d.com", from: "a", to: "b" })).rejects.toThrow(
      /Invalid or revoked API key/,
    );
  });

  it("reports the keyword count for a tracked domain", async () => {
    const { impl } = stubFetch({
      ok: true,
      data: [{ domain: "gulfrecoverygroup.com", keyword_count: 84, last_checked: "2026-09-01 08:49:02", project_id: 18 }],
    });
    const d = await client(impl).domains();
    expect(d[0].keyword_count).toBe(84);
  });

  it("pages through history until the API stops returning full pages", async () => {
    let call = 0;
    const impl = (async (url: string) => {
      call++;
      const offset = Number(new URL(url).searchParams.get("offset") ?? 0);
      // 1000 rows on the first page, 3 on the second -> two calls total.
      const n = offset === 0 ? 1000 : 3;
      return {
        ok: true, status: 200,
        json: async () => ({
          ok: true,
          data: Array.from({ length: n }, (_, i) => ({
            domain: "d.com", keyword: `k${offset + i}`, country: "SA",
            language: "ar", position: 1, checked_at: "2026-09-01 05:00:00",
          })),
        }),
      } as Response;
    }) as unknown as typeof fetch;
    const rows = await client(impl).history({ domain: "d.com", from: "a", to: "b" });
    expect(rows.length).toBe(1003);
    expect(call).toBe(2);
  });
});

import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { readBacklinkSheetRows } from "./read-sheet";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const KEY = JSON.stringify({ client_email: "seo-audit@example.iam.gserviceaccount.com", private_key: privateKey });
const URL_ = "https://docs.google.com/spreadsheets/d/SHEET/export?format=csv&gid=662124179";

type Call = { url: string; auth: string | null };
const recorder = (reply: (url: string) => Response) => {
  const calls: Call[] = [];
  const fetchImpl = async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), auth: new Headers(init?.headers).get("authorization") });
    return reply(String(url));
  };
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
};

describe("readBacklinkSheetRows", () => {
  it("fetches the CSV export with no credentials when none are configured", async () => {
    const { calls, fetchImpl } = recorder(() => new Response("a,b\nc,d", { status: 200 }));
    const rows = await readBacklinkSheetRows({ csvUrl: URL_ }, { fetchImpl });
    expect(rows).toEqual([["a", "b"], ["c", "d"]]);
    expect(calls).toHaveLength(1);
    expect(calls[0].auth).toBeNull();
  });

  it("says what Google answered when the sheet is not readable without a login", async () => {
    const { fetchImpl } = recorder(() => new Response("<html>login</html>", { status: 401 }));
    await expect(readBacklinkSheetRows({ csvUrl: URL_ }, { fetchImpl })).rejects.toThrow(
      /HTTP 401[\s\S]*shared/,
    );
  });

  // The point of the whole exercise: the sheet stays private and the sync identifies itself.
  it("reads it as the service account when a key is configured, never anonymously", async () => {
    const { calls, fetchImpl } = recorder((url) => {
      if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: "ya29.x" }), { status: 200 });
      if (url.includes("?fields=")) {
        return new Response(JSON.stringify({ sheets: [{ properties: { sheetId: 662124179, title: "BL" } }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ values: [["a", "b"], ["c", "d"]] }), { status: 200 });
    });

    const rows = await readBacklinkSheetRows({ csvUrl: URL_, serviceAccountJson: KEY }, { fetchImpl });

    expect(rows).toEqual([["a", "b"], ["c", "d"]]);
    expect(calls.some((c) => c.url.includes("docs.google.com"))).toBe(false);
    expect(calls.filter((c) => c.url.includes("sheets.googleapis.com")).every((c) => c.auth === "Bearer ya29.x")).toBe(true);
  });

  it("refuses a key with a link it cannot find a spreadsheet in", async () => {
    const { fetchImpl } = recorder(() => new Response("{}", { status: 200 }));
    await expect(
      readBacklinkSheetRows({ csvUrl: "https://example.com/data.csv", serviceAccountJson: KEY }, { fetchImpl }),
    ).rejects.toThrow(/spreadsheet/i);
  });

  it("asks for the sheet to be configured at all", async () => {
    const { fetchImpl } = recorder(() => new Response("", { status: 200 }));
    await expect(readBacklinkSheetRows({}, { fetchImpl })).rejects.toThrow(/BACKLINKS_SHEET_CSV_URL/);
  });
});

describe("reading the sheet as a staff account", () => {
  it("acts as the configured user so the sheet needs no service-account share", async () => {
    let body = "";
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("oauth2")) {
        body = String(init?.body ?? "");
        return new Response(JSON.stringify({ access_token: "ya29.x" }), { status: 200 });
      }
      if (u.includes("?fields=")) {
        return new Response(JSON.stringify({ sheets: [{ properties: { sheetId: 662124179, title: "BL" } }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ values: [["a"]] }), { status: 200 });
    }) as unknown as typeof fetch;

    await readBacklinkSheetRows(
      { csvUrl: URL_, serviceAccountJson: KEY, impersonateUser: "operations@optinetsolutions.com" },
      { fetchImpl },
    );

    const assertion = new URLSearchParams(body).get("assertion") ?? "";
    const claims = JSON.parse(Buffer.from(assertion.split(".")[1], "base64url").toString("utf8"));
    expect(claims.sub).toBe("operations@optinetsolutions.com");
  });
});

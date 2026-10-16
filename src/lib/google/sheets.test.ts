import { describe, it, expect } from "vitest";
import { extractSheetRef, fetchSheetRows } from "./sheets";

describe("extractSheetRef", () => {
  it("reads the file and tab out of the CSV export link the sync is configured with", () => {
    expect(
      extractSheetRef("https://docs.google.com/spreadsheets/d/1brEH5oT6qewhGPenUJmlPB_wB3iGonOcHa19zcpHWYY/export?format=csv&gid=662124179"),
    ).toEqual({ spreadsheetId: "1brEH5oT6qewhGPenUJmlPB_wB3iGonOcHa19zcpHWYY", gid: 662124179 });
  });

  // What someone actually pastes from the browser, fragment and all.
  it("reads the link a browser gives you, with the tab in the fragment", () => {
    expect(
      extractSheetRef("https://docs.google.com/spreadsheets/d/1brEH5oT6qewhGPenUJmlPB_wB3iGonOcHa19zcpHWYY/edit?gid=662124179#gid=662124179"),
    ).toEqual({ spreadsheetId: "1brEH5oT6qewhGPenUJmlPB_wB3iGonOcHa19zcpHWYY", gid: 662124179 });
  });

  it("defaults to the first tab when the link names none", () => {
    expect(extractSheetRef("https://docs.google.com/spreadsheets/d/abc123/edit")).toEqual({
      spreadsheetId: "abc123",
      gid: 0,
    });
  });

  it("returns null for something that isn't a spreadsheet link", () => {
    expect(extractSheetRef("https://example.com/data.csv")).toBeNull();
    expect(extractSheetRef(undefined)).toBeNull();
  });
});

describe("fetchSheetRows", () => {
  const ref = { spreadsheetId: "SHEET", gid: 662124179 };

  const api = (bodies: Record<string, unknown>) => {
    const seen: Array<{ url: string; auth: string | null }> = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      seen.push({ url: u, auth: new Headers(init?.headers).get("authorization") });
      const key = Object.keys(bodies).find((k) => u.includes(k));
      if (!key) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify(bodies[key]), { status: 200 });
    };
    return { seen, fetchImpl: fetchImpl as unknown as typeof fetch };
  };

  it("finds the tab by its id and returns that tab's rows", async () => {
    const { seen, fetchImpl } = api({
      "?fields=": { sheets: [{ properties: { sheetId: 0, title: "Summary" } }, { properties: { sheetId: 662124179, title: "BACKLINKS 2026" } }] },
      "/values/": { values: [["ARTICLE/BLOGS", "BACKLINK"], ["example.com", "https://example.com/a"]] },
    });

    const rows = await fetchSheetRows(ref, "ya29.test", { fetchImpl });

    expect(rows).toEqual([["ARTICLE/BLOGS", "BACKLINK"], ["example.com", "https://example.com/a"]]);
    // The tab name is what the values endpoint takes, so it has to be looked up and encoded.
    expect(seen[1].url).toContain(encodeURIComponent("BACKLINKS 2026"));
    expect(seen.every((c) => c.auth === "Bearer ya29.test")).toBe(true);
  });

  it("names the tab it could not find, with the ones that exist", async () => {
    const { fetchImpl } = api({ "?fields=": { sheets: [{ properties: { sheetId: 0, title: "Summary" } }] } });
    await expect(fetchSheetRows(ref, "ya29.test", { fetchImpl })).rejects.toThrow(/662124179[\s\S]*Summary/);
  });

  // Rows are ragged: Google stops each one at its last filled cell, so a row whose remarks are
  // empty comes back short and the parser would read undefined where it expects a string.
  it("pads short rows out to the width of the widest one", async () => {
    const { fetchImpl } = api({
      "?fields=": { sheets: [{ properties: { sheetId: 662124179, title: "T" } }] },
      "/values/": { values: [["a", "b", "c", "d", "e", "f", "g"], ["x", "y"]] },
    });
    const rows = await fetchSheetRows(ref, "t", { fetchImpl });
    expect(rows[1]).toEqual(["x", "y", "", "", "", "", ""]);
  });

  it("returns no rows for an empty tab rather than failing", async () => {
    const { fetchImpl } = api({
      "?fields=": { sheets: [{ properties: { sheetId: 662124179, title: "T" } }] },
      "/values/": {},
    });
    expect(await fetchSheetRows(ref, "t", { fetchImpl })).toEqual([]);
  });
});

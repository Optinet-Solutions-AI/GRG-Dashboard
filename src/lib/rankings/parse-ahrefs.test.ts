import { describe, it, expect } from "vitest";
import { parseAhrefsExport, toPosition, decodeExport } from "./parse-ahrefs";

const TAB = "\t";
const HEADER = ["Keyword", "Previous position", "Current position", "Country code", "Current update date"]
  .map((h) => `"${h}"`)
  .join(TAB);
const row = (kw: string, prev: string, cur: string, cc: string, date: string) =>
  [kw, prev, cur, cc, date].map((v) => `"${v}"`).join(TAB);

describe("toPosition", () => {
  it("accepts integers 1..100", () => {
    expect(toPosition("7")).toBe(7);
    expect(toPosition("100")).toBe(100);
  });
  it("treats blank, 0, and >100 as not-ranking (null)", () => {
    expect(toPosition("")).toBeNull();
    expect(toPosition("0")).toBeNull();
    expect(toPosition("150")).toBeNull();
    expect(toPosition("NR")).toBeNull();
  });
});

describe("parseAhrefsExport", () => {
  it("extracts keyword / country / current / previous / date (Arabic + NR)", () => {
    const text = [
      HEADER,
      row("احتيال منصات التداول", "18", "16", "SA", "2026-06-09 01:59:33"),
      row("وسيط تداول لا يرد", "", "41", "BH", "2026-06-09 01:30:00"),
      row("شكوى ضد شركة تداول", "20", "", "OM", "2026-06-09 02:00:00"),
    ].join("\n");
    const rows = parseAhrefsExport(text);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ keyword: "احتيال منصات التداول", countryCode: "SA", current: 16, previous: 18, date: "2026-06-09" });
    expect(rows[1].current).toBe(41);
    expect(rows[1].previous).toBeNull(); // newly entered (no previous)
    expect(rows[2].current).toBeNull(); // dropped out of top 100
    expect(rows[2].previous).toBe(20);
  });

  it("throws on an unrecognized format", () => {
    expect(() => parseAhrefsExport("a,b,c\n1,2,3")).toThrow();
  });
});

describe("decodeExport", () => {
  it("decodes UTF-16LE with BOM", () => {
    const txt = "Keyword\tCurrent position\tCountry code";
    const u16 = new Uint8Array(2 + txt.length * 2);
    u16[0] = 0xff; u16[1] = 0xfe;
    for (let i = 0; i < txt.length; i++) { u16[2 + i * 2] = txt.charCodeAt(i); u16[3 + i * 2] = 0; }
    expect(decodeExport(u16)).toBe(txt);
  });
  it("decodes plain UTF-8", () => {
    const bytes = new TextEncoder().encode("Keyword,Current position,Country code");
    expect(decodeExport(bytes)).toContain("Keyword");
  });
});

describe("ranking-history layout — the one that failed to upload", () => {
  // Exactly the columns the tracker emits for "Ranking history". The upload rejected these as
  // "Unrecognized export" because it only knew the Overview layout's column names.
  const HEAD = [
    "Keyword", "Tags", "Volume", "Position", "Position: Date", "Position 1 day ago",
    "Position 1 day ago: Change", "Position 1 day ago: Date", "Position 7 days ago",
    "Position 7 days ago: Change", "Position 7 days ago: Date", "Country code", "Location",
    "Language", "Updated",
  ];
  const line = (cells: string[]) => cells.map((c) => `"${c}"`).join(TAB);
  const text = [
    line(HEAD),
    line(["KW-AR", "", "30", "23", "2026-10-13 01:59:38", "23", "0",
      "2026-10-13 01:59:38", "28", "-5", "2026-10-06 01:59:32", "AE", "United Arab Emirates", "ar",
      "2026-10-13 01:59:38"]),
    line(["KW-NR", "", "30", "", "2026-10-13 17:17:39", "", "", "2026-10-13 17:17:39",
      "", "", "2026-10-06 17:17:37", "OM", "Oman", "ar", "2026-10-13 17:17:39"]),
  ].join("\n");

  it("parses it instead of rejecting the file", () => {
    const rows = parseAhrefsExport(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      keyword: "KW-AR", countryCode: "AE", current: 23, previous: 28, date: "2026-10-13",
    });
  });

  it("takes 'Position 7 days ago' as the previous position, so movement is week over week", () => {
    expect(parseAhrefsExport(text)[0].previous).toBe(28);
  });

  it("reads a blank Position as not ranking, not as zero", () => {
    expect(parseAhrefsExport(text)[1].current).toBeNull();
  });

  it("still parses the Overview layout it always handled", () => {
    const overview = [HEADER, row("kw", "18", "16", "SA", "2026-06-09")].join("\n");
    expect(parseAhrefsExport(overview)[0]).toEqual({
      keyword: "kw", countryCode: "SA", current: 16, previous: 18, date: "2026-06-09",
    });
  });

  it("names both accepted layouts when a file really is unusable", () => {
    expect(() => parseAhrefsExport("Foo\tBar\n1\t2")).toThrow(/Current position[\s\S]*Position/);
  });
});

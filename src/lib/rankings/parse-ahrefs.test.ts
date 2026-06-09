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

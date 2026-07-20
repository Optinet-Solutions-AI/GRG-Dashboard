import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import {
  normalizeCountry,
  toPositionValue,
  toDate,
  isXlsx,
  parseXlsxRankings,
  parseRankingsFile,
} from "./parse-rankings";

async function makeXlsx(dataRows: unknown[][], sheet = "Rankings"): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  ws.addRow(["Domain", "Keyword", "Country", "Position", "Previous", "Change", "Last Check"]);
  dataRows.forEach((r) => ws.addRow(r));
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf);
}

describe("normalizeCountry", () => {
  it("maps full names and codes to the DB 2-letter code", () => {
    expect(normalizeCountry("Saudi Arabia")).toBe("SA");
    expect(normalizeCountry("United Arab Emirates")).toBe("AE");
    expect(normalizeCountry("uae")).toBe("AE");
    expect(normalizeCountry("Qatar")).toBe("QA");
    expect(normalizeCountry("Oman")).toBe("OM");
    expect(normalizeCountry("OM")).toBe("OM");
  });
  it("passes unknown values through uppercased (so they surface as unmatched)", () => {
    expect(normalizeCountry("Australia")).toBe("AUSTRALIA");
  });
});

describe("toPositionValue", () => {
  it("accepts 1..100 (number or string), else null", () => {
    expect(toPositionValue(4)).toBe(4);
    expect(toPositionValue("12")).toBe(12);
    expect(toPositionValue(0)).toBeNull();
    expect(toPositionValue(150)).toBeNull();
    expect(toPositionValue("Not Ranking")).toBeNull();
    expect(toPositionValue("")).toBeNull();
    expect(toPositionValue(null)).toBeNull();
  });
});

describe("toDate", () => {
  it("extracts yyyy-mm-dd from text or Date", () => {
    expect(toDate("2026-07-20 02:45")).toBe("2026-07-20");
    expect(toDate(new Date("2026-07-20T09:00:00Z"))).toBe("2026-07-20");
    expect(toDate("")).toBe("");
    expect(toDate("no date here")).toBe("");
  });
});

describe("parseXlsxRankings (new multi-domain format)", () => {
  it("parses rows, maps countries/positions/dates, keeps domain", async () => {
    const bytes = await makeXlsx([
      ["gulfrecoverygroup.com", "استرجاع أموال التداول", "Saudi Arabia", 7, 7, "0", "2026-07-20 02:46"],
      ["gulfrecoverygroup.com", "استرجاع أموال التداول", "Kuwait", 4, 27, "+23", "2026-07-20 02:46"],
      ["gulfrecoverygroup.com", "احتيال منصات التداول", "Bahrain", "Not Ranking", "", "", "2026-07-20 02:45"],
      ["other-casino.com", "some kw", "Australia", 5, 6, "+1", "2026-07-20 02:46"],
    ]);
    expect(isXlsx(bytes)).toBe(true);
    const rows = await parseXlsxRankings(bytes);
    expect(rows).toHaveLength(4);

    const kw = rows.find((r) => r.countryCode === "KW")!;
    expect(kw.current).toBe(4);
    expect(kw.previous).toBe(27);
    expect(kw.domain).toBe("gulfrecoverygroup.com");
    expect(kw.date).toBe("2026-07-20");

    const bh = rows.find((r) => r.countryCode === "BH")!;
    expect(bh.current).toBeNull(); // "Not Ranking"

    // multi-domain: the other site's rows are present (the action filters by domain, not the parser)
    expect(rows.some((r) => r.domain === "other-casino.com")).toBe(true);
  });
});

describe("parseRankingsFile (format auto-detect)", () => {
  it("routes xlsx bytes to the xlsx parser", async () => {
    const bytes = await makeXlsx([["d.com", "kw", "Qatar", 3, 4, "+1", "2026-07-20"]]);
    const rows = await parseRankingsFile(bytes);
    expect(rows[0].countryCode).toBe("QA");
    expect(rows[0].current).toBe(3);
  });
  it("routes delimited Ahrefs bytes to the CSV parser (domain null)", async () => {
    const csv = "Keyword\tPrevious position\tCurrent position\tCountry code\tCurrent update date\nkw\t5\t3\tAE\t2026-07-20";
    const rows = await parseRankingsFile(new TextEncoder().encode(csv));
    expect(rows[0].domain).toBeNull();
    expect(rows[0].countryCode).toBe("AE");
    expect(rows[0].current).toBe(3);
    expect(rows[0].previous).toBe(5);
  });
});

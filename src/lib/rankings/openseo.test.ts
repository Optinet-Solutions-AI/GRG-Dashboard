import { describe, it, expect } from "vitest";
import {
  parseOpenSeoCsv, classifyKeywords, pickWeek, siteFromFilename, exportDate, siteFromKeywords, keywordKey,
} from "./openseo.mjs";

const HEADER = "Keyword,Previous position,Current position,Country code,Current update date";
const csv = (...lines: string[]) => [HEADER, ...lines].join("\n");

describe("parseOpenSeoCsv", () => {
  it("reads Arabic through a BOM and keeps the text byte-for-byte", () => {
    const rows = parseOpenSeoCsv("﻿" + csv('"استرجاع أموال التداول",18,16,SA,2026-10-02'));
    expect(rows[0]).toEqual({
      keyword: "استرجاع أموال التداول", countryCode: "SA", current: 16, previous: 18, date: "2026-10-02",
    });
  });

  it("treats NR, 0, blank and out-of-range as not ranking — never as position 0", () => {
    const rows = parseOpenSeoCsv(csv("a,NR,NR,AE,2026-10-02", "b,,0,AE,2026-10-02", "c,,101,AE,2026-10-02"));
    expect(rows.map((r) => r.current)).toEqual([null, null, null]);
  });

  it("rejects a file that isn't a rankings export rather than importing nonsense", () => {
    expect(() => parseOpenSeoCsv("Foo,Bar\n1,2")).toThrow(/Unrecognized export/);
  });

  it("skips rows with no keyword or no country instead of creating phantom pairs", () => {
    const rows = parseOpenSeoCsv(csv(",,5,AE,2026-10-02", "kw,,5,,2026-10-02", "kw,,5,AE,2026-10-02"));
    expect(rows).toHaveLength(1);
  });
});

describe("classifyKeywords — the adoption policy", () => {
  const tracked = new Set(["tracked-kw"]);

  it("keeps a tracked keyword tracked even when it ranks nowhere", () => {
    const rows = parseOpenSeoCsv(csv("tracked-kw,,NR,AE,2026-10-02"));
    const { known, adopt, skip } = classifyKeywords(rows, tracked);
    expect(known).toEqual(["tracked-kw"]);
    expect(adopt).toHaveLength(0);
    expect(skip).toHaveLength(0);
  });

  it("adopts a new Arabic keyword only when it ranks in the top 100 somewhere", () => {
    const rows = parseOpenSeoCsv(csv(
      "حساب التداول مجمد شو الحل,,5,AE,2026-10-02",
      "حساب التداول مجمد شو الحل,,NR,SA,2026-10-02",
      "كلمة لا ترتب,,NR,AE,2026-10-02",
    ));
    const { adopt, skip } = classifyKeywords(rows, tracked);
    expect(adopt.map((a) => a.keyword)).toEqual(["حساب التداول مجمد شو الحل"]);
    expect(adopt[0]).toMatchObject({ language: "ar" });
    expect(adopt[0].reason).toContain("#5");
    expect(skip).toEqual(["كلمة لا ترتب"]);
  });

  it("adopts the English set on arrival even unranked, on a site that already tracks keywords", () => {
    const { adopt } = classifyKeywords(parseOpenSeoCsv(csv("frozen trading account,,NR,AE,2026-10-02")), tracked);
    expect(adopt).toEqual([
      { keyword: "frozen trading account", language: "en", reason: expect.stringContaining("English") },
    ]);
  });

  it("does NOT wave through an unranked Latin keyword on a site with no history (.org / .net)", () => {
    // .org and .net have no permanent main set, so there is nothing for an "English
    // counterpart" to be a counterpart OF — the top-100 rule applies to it like anything else.
    const rows = parseOpenSeoCsv(csv("SMOKE-UNRANKED,,NR,AE,2026-10-03", "SMOKE-RANKED,,7,AE,2026-10-03"));
    const { adopt, skip } = classifyKeywords(rows, new Set());
    expect(skip).toEqual(["SMOKE-UNRANKED"]);
    expect(adopt).toEqual([{ keyword: "SMOKE-RANKED", language: "en", reason: "ranks #7 in AE" }]);
  });
});

describe("pickWeek — a sweep that arrives in pieces must land in ONE week", () => {
  it("merges a follow-up export into the week the first part opened", () => {
    // The real case: .com round 1 landed 2026-10-02 only a quarter complete.
    expect(pickWeek("2026-10-05", ["2026-09-21", "2026-10-02"])).toEqual({ week: "2026-10-02", mode: "merge" });
  });

  it("starts a new week once the gap is bigger than the window", () => {
    expect(pickWeek("2026-10-12", ["2026-10-02"])).toEqual({ week: "2026-10-12", mode: "new" });
  });

  it("never merges backwards into a week that is newer than the export", () => {
    expect(pickWeek("2026-09-30", ["2026-10-02"])).toEqual({ week: "2026-09-30", mode: "new" });
  });

  it("opens a new week when the site has no history at all (.org / .net)", () => {
    expect(pickWeek("2026-10-03", [])).toEqual({ week: "2026-10-03", mode: "new" });
  });

  it("merges into the closest matching week, not the oldest one in range", () => {
    expect(pickWeek("2026-10-05", ["2026-09-30", "2026-10-02"])).toEqual({ week: "2026-10-02", mode: "merge" });
  });
});

describe("siteFromFilename", () => {
  it("routes each export to its own domain", () => {
    expect(siteFromFilename("grg-com-openseo-2026-10-02.csv")).toBe("gulfrecoverygroup.com");
    expect(siteFromFilename("grg-com-openseo-round2-2026-10-05.csv")).toBe("gulfrecoverygroup.com");
    expect(siteFromFilename("grg.org-openseo-2026-10-03.csv")).toBe("gulfrecoverygroup.org");
    expect(siteFromFilename("grg.net-openseo-2026-10-03.csv")).toBe("gulfrecoverygroup.net");
  });

  it("returns null rather than guessing a site it cannot identify", () => {
    expect(siteFromFilename("rankings-final.csv")).toBeNull();
  });
});

describe("exportDate", () => {
  it("takes the latest check date in the file", () => {
    const rows = parseOpenSeoCsv(csv("a,,1,AE,2026-10-01", "b,,2,AE,2026-10-02"));
    expect(exportDate(rows)).toBe("2026-10-02");
  });
  it("is null when the file carries no usable date", () => {
    expect(exportDate(parseOpenSeoCsv(csv("a,,1,AE,")))).toBeNull();
  });
});

describe("siteFromKeywords — the fallback when a filename doesn't name a site", () => {
  const fingerprints = {
    "gulfrecoverygroup.com": ["com-one", "com-two", "com-three", "com-four"],
    "gulfrecoverygroup.org": ["org-one", "org-two", "org-three", "org-four"],
    "gulfrecoverygroup.net": ["net-one", "net-two", "net-three", "net-four"],
  };
  const rowsFor = (...kws: string[]) =>
    parseOpenSeoCsv([HEADER, ...kws.map((k) => `${k},,NR,AE,2026-10-03`)].join("\n"));

  it("identifies the site from its keywords when the name gives nothing away", () => {
    const got = siteFromKeywords(rowsFor("org-one", "org-two", "org-three"), fingerprints);
    expect(got?.domain).toBe("gulfrecoverygroup.org");
    expect(got?.share).toBe(1);
  });

  it("refuses to guess when the file barely matches anything", () => {
    // Writing a whole sweep to the wrong dashboard is far worse than skipping the file.
    expect(siteFromKeywords(rowsFor("org-one", "x", "y", "z", "w"), fingerprints)).toBeNull();
  });

  it("refuses to guess when two sites score too close together", () => {
    expect(siteFromKeywords(rowsFor("org-one", "org-two", "net-one", "net-two"), fingerprints)).toBeNull();
  });

  it("tolerates a few unknown keywords as long as one site clearly dominates", () => {
    const got = siteFromKeywords(rowsFor("net-one", "net-two", "net-three", "brand-new-kw"), fingerprints);
    expect(got?.domain).toBe("gulfrecoverygroup.net");
  });

  it("returns null for an empty file instead of dividing by zero", () => {
    expect(siteFromKeywords([], fingerprints)).toBeNull();
  });
});

describe("classifyKeywords — a site being tracked for the FIRST time", () => {
  const rows = parseOpenSeoCsv([
    HEADER,
    "كلمة ترتب,,7,AE,2026-10-03",
    "كلمة لا ترتب,,NR,AE,2026-10-03",
    "كلمة أخرى لا ترتب,,NR,SA,2026-10-03",
  ].join("\n"));

  it("adopts everything, so a grid where nothing ranks still has a table to draw", () => {
    // The real .org case: 98 keywords across six markets, none in the top 100, nothing stored,
    // and the page had no table at all.
    const { adopt, skip } = classifyKeywords(rows, new Set(), { establishing: true });
    expect(adopt).toHaveLength(3);
    expect(skip).toEqual([]);
    expect(adopt.every((a) => a.reason.includes("first run"))).toBe(true);
  });

  it("still applies the strict top-100 rule once the site has history", () => {
    const { adopt, skip } = classifyKeywords(rows, new Set(["كلمة ترتب"]));
    expect(adopt.map((a) => a.keyword)).toEqual([]);
    expect(skip).toEqual(["كلمة لا ترتب", "كلمة أخرى لا ترتب"]);
  });

  it("defaults to the strict rule when the caller says nothing", () => {
    const { skip } = classifyKeywords(rows, new Set(["x"]));
    expect(skip.length).toBeGreaterThan(0);
  });
});

describe("pickWeek — a first sweep that ranked nothing still anchors its week", () => {
  it("merges the follow-up into the week the check record opened", () => {
    // .org week 1 stored no ranking rows at all, only a check record. Passing the check weeks
    // in is what stops the follow-up opening a second, parallel week.
    expect(pickWeek("2026-10-03", ["2026-10-02"])).toEqual({ week: "2026-10-02", mode: "merge" });
  });
});

describe("keywordKey — one keyword, however it comes back spelled", () => {
  it("folds the Latin case OpenSEO applies, so USDT and usdt are the same keyword", () => {
    // 15 keywords were duplicated this way: the roster pointed at the sheet's spelling while
    // the results landed on a second row, so the grid said "Not checked" forever.
    expect(keywordKey("تتبع محفظة USDT")).toBe(keywordKey("تتبع محفظة usdt"));
  });

  it("ignores stray whitespace without touching the Arabic itself", () => {
    expect(keywordKey("  استرجاع   أموال التداول ")).toBe(keywordKey("استرجاع أموال التداول"));
  });

  it("still tells genuinely different keywords apart", () => {
    // Dialect variants are different keywords, not spellings of one.
    expect(keywordKey("وش علامات النصب في التداول")).not.toBe(keywordKey("شنو علامات النصب في التداول"));
  });

  it("treats a case-folded keyword as already tracked instead of adopting it again", () => {
    const rows = parseOpenSeoCsv([HEADER, "تتبع محفظة usdt,,NR,AE,2026-10-03"].join("\n"));
    const { known, adopt } = classifyKeywords(rows, new Set(["تتبع محفظة USDT"]));
    expect(known).toEqual(["تتبع محفظة usdt"]);
    expect(adopt).toEqual([]);
  });
});

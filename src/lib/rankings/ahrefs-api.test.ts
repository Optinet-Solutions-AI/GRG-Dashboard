import { describe, it, expect } from "vitest";
import { ourPosition, toRankingRows, weekOf, projectForDomain } from "./ahrefs-api";

/**
 * Ahrefs' rank tracker answers with one row per keyword×location, and every row carries a
 * competitors_list whose FIRST entry is the project's own target. Reading our position means
 * picking our own domain out of that list — never position index 0 by luck, and never a
 * competitor's number, which would publish a rival's ranking as the client's own.
 */
const row = (over: Record<string, unknown> = {}) => ({
  keyword: "تجميد حساب التداول",
  country: "SA",
  location: "Saudi Arabia",
  language: "ar",
  serp_updated: "2026-11-11T02:20:04Z",
  serp_updated_prev: "2026-11-04T02:11:09Z",
  competitors_list: [
    { url: "https://gulfrecoverygroup.com/page", position: 12, position_prev: 19 },
    { url: "https://rival.example/x", position: 3, position_prev: 2 },
  ],
  ...over,
});

describe("ourPosition", () => {
  it("reads the entry whose host is ours, not the first in the list", () => {
    const r = row({
      competitors_list: [
        { url: "https://rival.example/x", position: 3, position_prev: 2 },
        { url: "https://gulfrecoverygroup.com/page", position: 12, position_prev: 19 },
      ],
    });
    expect(ourPosition(r, "gulfrecoverygroup.com")).toEqual({ position: 12, previous: 19 });
  });

  it("matches on host, ignoring scheme, www and the path", () => {
    const r = row({ competitors_list: [{ url: "http://www.gulfrecoverygroup.com/ar/x?y=1", position: 5, position_prev: null }] });
    expect(ourPosition(r, "gulfrecoverygroup.com")).toEqual({ position: 5, previous: null });
  });

  // Not ranking is a measured result — the slot exists and Ahrefs says we are nowhere.
  it("reports not-ranking as null rather than dropping the slot", () => {
    const r = row({ competitors_list: [{ url: null, position: null, position_prev: null }] });
    expect(ourPosition(r, "gulfrecoverygroup.com")).toEqual({ position: null, previous: null });
  });

  it("never returns a competitor's position when ours is absent", () => {
    const r = row({ competitors_list: [{ url: "https://rival.example/x", position: 3, position_prev: 2 }] });
    expect(ourPosition(r, "gulfrecoverygroup.com")).toEqual({ position: null, previous: null });
  });

  it("is not fooled by a domain that merely ends with ours", () => {
    const r = row({ competitors_list: [{ url: "https://notgulfrecoverygroup.com/x", position: 4, position_prev: 4 }] });
    expect(ourPosition(r, "gulfrecoverygroup.com")).toEqual({ position: null, previous: null });
  });
});

describe("toRankingRows", () => {
  it("shapes one row per keyword and market", () => {
    const rows = toRankingRows([row(), row({ country: "AE", competitors_list: [{ url: "https://gulfrecoverygroup.com/", position: null, position_prev: 8 }] })], "gulfrecoverygroup.com");
    expect(rows).toEqual([
      { keyword: "تجميد حساب التداول", countryCode: "SA", position: 12, previous: 19 },
      { keyword: "تجميد حساب التداول", countryCode: "AE", position: null, previous: 8 },
    ]);
  });

  it("upper-cases the market code, which our countries table is keyed on", () => {
    expect(toRankingRows([row({ country: "sa" })], "gulfrecoverygroup.com")[0].countryCode).toBe("SA");
  });

  it("skips a row with no keyword or no market rather than writing a nameless slot", () => {
    expect(toRankingRows([row({ keyword: "" }), row({ country: null })], "gulfrecoverygroup.com")).toEqual([]);
  });
});

describe("weekOf", () => {
  // The week is Ahrefs' own update stamp, not the day we happened to fetch: a Thursday
  // retry after a failed Wednesday must land on the same week as the Wednesday would have.
  it("takes the most recent SERP update date across the project", () => {
    expect(weekOf([row({ serp_updated: "2026-11-09T02:00:00Z" }), row({ serp_updated: "2026-11-11T02:20:04Z" })])).toBe("2026-11-11");
  });

  it("returns null when no row carries an update date", () => {
    expect(weekOf([row({ serp_updated: null })])).toBeNull();
  });
});

describe("projectForDomain", () => {
  const projects = [
    { project_id: 1, project_name: "Gulfrecoverygroup.com", url: "gulfrecoverygroup.com/" },
    { project_id: 2, project_name: "Gulfrecoverygroup.org", url: "gulfrecoverygroup.org/" },
  ];

  it("finds a project by its target host", () => {
    expect(projectForDomain(projects, "gulfrecoverygroup.org")?.project_id).toBe(2);
  });

  it("does not confuse .com with .org", () => {
    expect(projectForDomain(projects, "gulfrecoverygroup.com")?.project_id).toBe(1);
  });

  it("returns null when the workspace has no project for a site", () => {
    expect(projectForDomain(projects, "example.com")).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { parsePsiScore, parsePsiScreenshot, parsePsiCategories } from "./parse-psi";

describe("parsePsiScore", () => {
  it("converts a 0..1 performance score to 0..100", () => {
    expect(parsePsiScore({ lighthouseResult: { categories: { performance: { score: 0.98 } } } })).toBe(98);
  });
  it("rounds to the nearest integer", () => {
    expect(parsePsiScore({ lighthouseResult: { categories: { performance: { score: 0.736 } } } })).toBe(74);
  });
  it("treats a zero score as 0, not missing", () => {
    expect(parsePsiScore({ lighthouseResult: { categories: { performance: { score: 0 } } } })).toBe(0);
  });
  it("returns null when the score is absent", () => {
    expect(parsePsiScore({})).toBeNull();
    expect(parsePsiScore({ error: { message: "rate limited" } })).toBeNull();
    expect(parsePsiScore(null)).toBeNull();
  });
  it("returns null when the score is not a number", () => {
    expect(parsePsiScore({ lighthouseResult: { categories: { performance: { score: "x" } } } })).toBeNull();
  });
});

describe("parsePsiScreenshot", () => {
  it("returns the final-screenshot data URI", () => {
    const json = { lighthouseResult: { audits: { "final-screenshot": { details: { data: "data:image/jpeg;base64,/9j/abc" } } } } };
    expect(parsePsiScreenshot(json)).toBe("data:image/jpeg;base64,/9j/abc");
  });
  it("returns null when absent or not a data URI", () => {
    expect(parsePsiScreenshot({})).toBeNull();
    expect(parsePsiScreenshot({ lighthouseResult: { audits: {} } })).toBeNull();
    expect(parsePsiScreenshot({ lighthouseResult: { audits: { "final-screenshot": { details: { data: 123 } } } } })).toBeNull();
  });
});

describe("parsePsiCategories", () => {
  it("extracts all four Lighthouse categories", () => {
    const json = { lighthouseResult: { categories: {
      performance: { score: 0.61 }, accessibility: { score: 0.80 },
      "best-practices": { score: 0.96 }, seo: { score: 0.85 },
    } } };
    expect(parsePsiCategories(json)).toEqual({ performance: 61, accessibility: 80, bestPractices: 96, seo: 85 });
  });
  it("returns nulls when categories are missing", () => {
    expect(parsePsiCategories({})).toEqual({ performance: null, accessibility: null, bestPractices: null, seo: null });
  });
});

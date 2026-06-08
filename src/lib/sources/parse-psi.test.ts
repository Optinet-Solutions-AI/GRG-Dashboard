import { describe, it, expect } from "vitest";
import { parsePsiScore } from "./parse-psi";

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

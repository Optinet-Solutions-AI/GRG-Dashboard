import { describe, it, expect } from "vitest";
import { parseQuery } from "./nlu";

const VOCAB = { countryCodes: ["SA", "QA", "OM", "KW", "BH", "AE"], keywords: ["استرجاع أموال التداول", "احتيال منصات التداول"] };
const p = (s: string) => parseQuery(s, VOCAB);

describe("parseQuery (tokenless NLU)", () => {
  it("detects ranking + country (full name and abbreviation)", () => {
    expect(p("how are my rankings in Saudi Arabia?").topics).toContain("ranking");
    expect(p("how are my rankings in Saudi Arabia?").country).toBe("SA");
    expect(p("ranking position in UAE").country).toBe("AE");
    expect(p("keyword positions in Kuwait").country).toBe("KW");
  });

  it("detects direction-scoped ranking questions", () => {
    const q = p("which keywords dropped in Qatar?");
    expect(q.topics).toContain("ranking");
    expect(q.country).toBe("QA");
    expect(q.direction).toBe("down");
    expect(p("what improved this week?").direction).toBe("up");
  });

  it("detects best/worst extremes", () => {
    expect(p("what's my best ranking keyword?").extreme).toBe("best");
    expect(p("show the worst performing keywords").extreme).toBe("worst");
  });

  it("detects pagespeed comparison", () => {
    const q = p("compare mobile vs desktop pagespeed");
    expect(q.topics).toContain("pagespeed");
    expect(q.comparison).toBe(true);
  });

  it("detects counts on backlinks", () => {
    const q = p("how many backlinks are indexed?");
    expect(q.topics).toContain("backlinks");
    expect(q.count).toBe(true);
  });

  it("detects focus questions", () => {
    expect(p("what should I focus on?").topics).toContain("focus");
    expect(p("which keywords should I prioritise?").topics).toContain("focus");
  });

  it("does not mistake 'Qatar' for the QA topic", () => {
    const q = p("what should I focus on in Qatar?");
    expect(q.country).toBe("QA");
    expect(q.topics).toContain("focus");
    expect(q.topics).not.toContain("qa");
  });

  it("handles compound multi-topic questions", () => {
    const q = p("give me a summary of rankings and backlinks");
    expect(q.topics).toContain("ranking");
    expect(q.topics).toContain("backlinks");
  });

  it("detects seo, health, qa and freshness topics", () => {
    expect(p("what's my seo score?").topics).toContain("seo");
    expect(p("show domain rating and organic traffic").topics).toContain("health");
    expect(p("how many QA pages are tracked?").topics).toContain("qa");
    expect(p("is any data stale or outdated?").topics).toContain("freshness");
  });

  it("greets and declines gracefully", () => {
    expect(p("hello there").greeting).toBe(true);
    expect(p("hello there").topics).toEqual([]);
    expect(p("what is the weather today").topics).toEqual([]);
  });

  it("matches a specific Arabic keyword from the vocab", () => {
    expect(p("how is استرجاع أموال التداول doing?").keyword).toBe("استرجاع أموال التداول");
  });
});

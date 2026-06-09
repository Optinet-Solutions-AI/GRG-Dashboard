import { describe, it, expect } from "vitest";
import { matchQuestion } from "./match";

describe("matchQuestion", () => {
  it("matches ranking questions", () => {
    expect(matchQuestion("what changed in rankings this week?")).toBe("ranking-changes");
    expect(matchQuestion("did any keyword drop?")).toBe("ranking-changes");
  });
  it("matches focus keywords over the broad ranking intent", () => {
    expect(matchQuestion("what keywords should I focus on?")).toBe("focus-keywords");
    expect(matchQuestion("which keywords to work on next?")).toBe("focus-keywords");
    expect(matchQuestion("where should I improve my weakest rankings?")).toBe("focus-keywords");
  });
  it("matches backlinks", () => {
    expect(matchQuestion("how many backlinks do we have?")).toBe("backlinks-summary");
    expect(matchQuestion("show our link building progress")).toBe("backlinks-summary");
  });
  it("matches seo score", () => {
    expect(matchQuestion("what's my seo score?")).toBe("seo-summary");
    expect(matchQuestion("how is my on-page seo?")).toBe("seo-summary");
  });
  it("matches pagespeed", () => {
    expect(matchQuestion("how is the page speed / performance?")).toBe("pagespeed-trend");
  });
  it("matches health", () => {
    expect(matchQuestion("show domain rating and organic traffic")).toBe("health-summary");
  });
  it("matches stale data", () => {
    expect(matchQuestion("what data is missing or outdated?")).toBe("missing-or-stale");
  });
  it("matches top mover", () => {
    expect(matchQuestion("which site improved most this week?")).toBe("top-mover-week");
  });
  it("returns null for unrelated text", () => {
    expect(matchQuestion("hello there")).toBeNull();
  });
});

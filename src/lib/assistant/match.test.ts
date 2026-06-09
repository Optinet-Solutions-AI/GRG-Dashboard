import { describe, it, expect } from "vitest";
import { matchQuestion } from "./match";

describe("matchQuestion", () => {
  it("matches ranking questions", () => {
    expect(matchQuestion("what changed in rankings this week?")).toBe("ranking-changes");
    expect(matchQuestion("did any keyword drop?")).toBe("ranking-changes");
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
  it("returns null for unrelated text", () => {
    expect(matchQuestion("hello there")).toBeNull();
  });
});

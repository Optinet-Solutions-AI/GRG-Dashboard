import { describe, it, expect } from "vitest";
import { pendingPagespeedUrls } from "./pending-urls";

const urls = [
  { id: "a", url: "https://a.com/" },
  { id: "b", url: "https://b.com/" },
  { id: "c", url: "https://c.com/" },
];

describe("pendingPagespeedUrls", () => {
  it("returns every url when none has today's entry", () => {
    expect(pendingPagespeedUrls(urls, [], 10).map((u) => u.id)).toEqual(["a", "b", "c"]);
  });

  it("skips urls already refreshed today, so a repeat call resumes instead of redoing", () => {
    const done = [{ pagespeed_url_id: "a" }, { pagespeed_url_id: "c" }];
    expect(pendingPagespeedUrls(urls, done, 10).map((u) => u.id)).toEqual(["b"]);
  });

  it("caps the batch so one invocation cannot exceed the function time limit", () => {
    expect(pendingPagespeedUrls(urls, [], 2).map((u) => u.id)).toEqual(["a", "b"]);
  });

  it("returns nothing once everything is done", () => {
    const done = urls.map((u) => ({ pagespeed_url_id: u.id }));
    expect(pendingPagespeedUrls(urls, done, 10)).toEqual([]);
  });

  it("treats a batch of zero as no work rather than everything", () => {
    expect(pendingPagespeedUrls(urls, [], 0)).toEqual([]);
  });
});

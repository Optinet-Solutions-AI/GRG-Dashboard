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

describe("pendingPagespeedUrls — fair rotation", () => {
  const three = [{ id: "com" }, { id: "org" }, { id: "net" }];

  it("puts the never-captured URL first, ahead of sort order", () => {
    // The live bug: .com is first by sort_order and was captured every automated run,
    // so .org/.net were never reached at all.
    const last = new Map([["com", "2026-09-01"], ["org", null], ["net", null]]);
    expect(pendingPagespeedUrls(three, [], 1, last).map((u) => u.id)).toEqual(["org"]);
  });

  it("then prefers the oldest capture", () => {
    const last = new Map([["com", "2026-09-09"], ["org", "2026-09-02"], ["net", "2026-09-07"]]);
    expect(pendingPagespeedUrls(three, [], 1, last).map((u) => u.id)).toEqual(["org"]);
    expect(pendingPagespeedUrls(three, [], 3, last).map((u) => u.id)).toEqual(["org", "net", "com"]);
  });

  it("rotates through every URL over consecutive days", () => {
    const last = new Map<string, string | null>([["com", "2026-09-09"], ["org", null], ["net", null]]);
    const picked: string[] = [];
    for (let day = 10; day < 13; day++) {
      const [next] = pendingPagespeedUrls(three, [], 1, last);
      picked.push(next.id);
      last.set(next.id, `2026-09-${day}`); // that day's capture
    }
    expect(picked.sort()).toEqual(["com", "net", "org"]);
  });

  it("still skips anything already captured today", () => {
    const last = new Map([["com", "2026-09-01"], ["org", null], ["net", null]]);
    const done = [{ pagespeed_url_id: "org" }];
    expect(pendingPagespeedUrls(three, done, 1, last).map((u) => u.id)).toEqual(["net"]);
  });

  it("falls back to sort order when no capture history is supplied", () => {
    expect(pendingPagespeedUrls(three, [], 1).map((u) => u.id)).toEqual(["com"]);
  });

  it("breaks ties on sort order so the pick is deterministic", () => {
    const last = new Map([["com", "2026-09-05"], ["org", "2026-09-05"], ["net", "2026-09-05"]]);
    expect(pendingPagespeedUrls(three, [], 1, last).map((u) => u.id)).toEqual(["com"]);
  });
});

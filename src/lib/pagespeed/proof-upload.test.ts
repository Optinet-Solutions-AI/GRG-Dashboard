import { describe, it, expect } from "vitest";
import { parseProofRequest, MAX_IMAGE_BYTES } from "./proof-upload";

// A real 1x1 PNG, so the magic-byte check is exercised against the genuine article.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const base = () => ({
  url: "https://gulfrecoverygroup.com/",
  strategy: "mobile",
  scores: { performance: 90, accessibility: 95, bestPractices: 100, seo: 100 },
  imageBase64: PNG.toString("base64"),
});

/**
 * This endpoint exists so the nightly capture can run in the cloud without carrying the
 * database key. That means it accepts a file and some numbers from outside Vercel, over a
 * shared secret — so everything it is handed is checked here, and the storage path is built
 * by the server from the URL's own id, never from anything the caller sent.
 */
describe("parseProofRequest", () => {
  it("accepts a well-formed capture", () => {
    const r = parseProofRequest(base());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.strategy).toBe("mobile");
      expect(r.value.image.length).toBe(PNG.length);
    }
  });

  it("takes only the two strategies that exist", () => {
    expect(parseProofRequest({ ...base(), strategy: "tablet" }).ok).toBe(false);
    expect(parseProofRequest({ ...base(), strategy: "desktop" }).ok).toBe(true);
  });

  it("refuses a score outside 0-100, which would fail the database check anyway", () => {
    const r = parseProofRequest({ ...base(), scores: { ...base().scores, performance: 140 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/performance/i);
  });

  it("allows a score Google did not return", () => {
    const r = parseProofRequest({ ...base(), scores: { ...base().scores, seo: null } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.scores.seo).toBeNull();
  });

  // Anything can be base64-encoded. Only a PNG should reach the screenshots bucket.
  it("refuses a payload that is not actually a PNG", () => {
    const r = parseProofRequest({ ...base(), imageBase64: Buffer.from("<html>nope</html>").toString("base64") });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/png/i);
  });

  it("refuses an image too large to be a report screenshot", () => {
    const huge = Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES + 1)]);
    const r = parseProofRequest({ ...base(), imageBase64: huge.toString("base64") });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/large|size/i);
  });

  it("requires the URL, since it is what the capture is attached to", () => {
    expect(parseProofRequest({ ...base(), url: "" }).ok).toBe(false);
    expect(parseProofRequest({ ...base(), url: undefined }).ok).toBe(false);
  });

  // The caller never names the file it writes: the server derives it from the URL's row id.
  it("ignores any path the caller tries to supply", () => {
    const r = parseProofRequest({ ...base(), path: "../../secrets/key.png" });
    expect(r.ok).toBe(true);
    if (r.ok) expect("path" in r.value).toBe(false);
  });

  it("rejects a body that is not an object at all", () => {
    expect(parseProofRequest(null).ok).toBe(false);
    expect(parseProofRequest("hello").ok).toBe(false);
  });
});

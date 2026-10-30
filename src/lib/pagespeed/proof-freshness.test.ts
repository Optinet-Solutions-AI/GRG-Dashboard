import { describe, it, expect } from "vitest";
import { proofFreshness, PROOF_STALE_AFTER_DAYS } from "./proof-freshness";

const entry = (date: string, withProof: boolean) => ({
  date,
  mobile_screenshot_path: withProof ? `pagespeed/x-mobile-${date}.png` : null,
  desktop_screenshot_path: withProof ? `pagespeed/x-desktop-${date}.png` : null,
});

/**
 * The capture failed every night from 2026-09-16 and nothing on the dashboard said so: the
 * scores kept arriving from a different route, so the page looked alive while the proof
 * images quietly stopped. This is the net that catches it next time, whatever the cause.
 */
describe("proofFreshness", () => {
  it("reports how long it has been since a report image was stored", () => {
    const f = proofFreshness([entry("2026-09-16", true), entry("2026-10-28", false)], "2026-10-30");
    expect(f.lastProof).toBe("2026-09-16");
    expect(f.daysSince).toBe(44);
  });

  it("warns once the gap is longer than a capture cycle allows for", () => {
    expect(proofFreshness([entry("2026-09-16", true)], "2026-10-30").stale).toBe(true);
  });

  it("stays quiet while captures are landing", () => {
    const f = proofFreshness([entry("2026-10-29", true)], "2026-10-30");
    expect(f.stale).toBe(false);
    expect(f.daysSince).toBe(1);
  });

  it("counts an entry with only one of the two images as proof", () => {
    const half = { date: "2026-10-29", mobile_screenshot_path: "pagespeed/x.png", desktop_screenshot_path: null };
    expect(proofFreshness([half], "2026-10-30").lastProof).toBe("2026-10-29");
  });

  // A brand new site has no history to be stale about; warning there is noise.
  it("says nothing when no image has ever been stored", () => {
    const f = proofFreshness([entry("2026-10-29", false)], "2026-10-30");
    expect(f.lastProof).toBeNull();
    expect(f.stale).toBe(false);
  });

  it("is quiet on an empty page", () => {
    expect(proofFreshness([], "2026-10-30")).toEqual({ lastProof: null, daysSince: null, stale: false });
  });

  // The capture is nightly now, not once per 15-day cycle, so the window that means
  // "something is wrong" is a few failed nights — not a fortnight of them.
  it("gives the nightly capture a few nights' grace, and no more", () => {
    expect(PROOF_STALE_AFTER_DAYS).toBeGreaterThanOrEqual(2);
    expect(PROOF_STALE_AFTER_DAYS).toBeLessThanOrEqual(5);
  });

  it("warns after three nights with nothing stored", () => {
    expect(proofFreshness([entry("2026-10-26", true)], "2026-10-30").stale).toBe(true);
  });

  it("does not warn over a single missed night", () => {
    expect(proofFreshness([entry("2026-10-29", true)], "2026-10-30").stale).toBe(false);
  });
});

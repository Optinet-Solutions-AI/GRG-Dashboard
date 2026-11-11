import { describe, it, expect } from "vitest";
import { scoreFields } from "./entry-write";

/**
 * Why this exists: "Auto-fill from PSI" inserted a brand-new row for the day every time it
 * was pressed. The nightly capture had already written that day's row WITH its report
 * images, so the fresh row buried it — the page shows the most recent row per URL, and the
 * card lost its screenshot. On 2026-11-11 the .com images were captured at 08:58 and sat
 * in storage with nothing pointing at them, because a 13:31 auto-fill had taken their place.
 *
 * The fix is for auto-fill to update the day's row instead of adding one. That makes these
 * fields dangerous in a new way: an update that carried a screenshot key would blank the
 * image it was supposed to preserve. So the patch is scores and nothing else.
 */
describe("scoreFields", () => {
  const m = { score: 95, accessibility: 100, bestPractices: 96, seo: 100 };
  const d = { score: 97, accessibility: 100, bestPractices: 100, seo: 100 };

  it("maps both strategies onto their columns", () => {
    expect(scoreFields(m, d)).toEqual({
      mobile_score: 95, mobile_accessibility: 100, mobile_best_practices: 96, mobile_seo: 100,
      desktop_score: 97, desktop_accessibility: 100, desktop_best_practices: 100, desktop_seo: 100,
    });
  });

  // The guard for the actual bug: updating a row must never be able to erase its proof.
  it("never writes a screenshot field, so an update cannot erase an image", () => {
    const keys = Object.keys(scoreFields(m, d));
    expect(keys.some((k) => k.includes("screenshot"))).toBe(false);
  });

  it("writes nulls when PSI returned only one strategy", () => {
    const f = scoreFields(m, undefined);
    expect(f.mobile_score).toBe(95);
    expect(f.desktop_score).toBeNull();
    expect(f.desktop_seo).toBeNull();
  });

  it("does not invent a date or a url id — the caller owns which row this lands on", () => {
    const keys = Object.keys(scoreFields(m, d));
    expect(keys).not.toContain("date");
    expect(keys).not.toContain("pagespeed_url_id");
  });
});

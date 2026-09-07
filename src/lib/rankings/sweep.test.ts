import { describe, it, expect } from "vitest";
import { shouldTriggerSweep, STALE_AFTER_HOURS, COVERAGE_RETRY_AFTER_HOURS } from "./sweep";

// Panel timestamps are UTC-4 (see parseCheckedAt), so a panel string of "04:00" is 08:00Z.
const now = new Date("2026-09-07T08:00:00Z");

describe("shouldTriggerSweep", () => {
  it("triggers when the tracker has never checked the site", () => {
    const d = shouldTriggerSweep({ lastChecked: null, now });
    expect(d.trigger).toBe(true);
    expect(d.reason).toMatch(/no check on record/i);
  });

  it("does not trigger while the last check is still fresh", () => {
    // Panel 2026-09-07 04:00 === 08:00Z === now.
    const d = shouldTriggerSweep({ lastChecked: "2026-09-07 04:00:00", now });
    expect(d.trigger).toBe(false);
    expect(d.reason).toMatch(/still fresh/i);
  });

  it("triggers once the last check passes the stale window", () => {
    // 2026-08-31 04:00 panel === 2026-08-31T08:00Z === 168h before now.
    const d = shouldTriggerSweep({ lastChecked: "2026-08-31 04:00:00", now });
    expect(d.trigger).toBe(true);
    expect(d.reason).toMatch(/stale after/i);
  });

  it("holds off one hour short of the window and fires one hour past it", () => {
    const justFresh = new Date(now.getTime() - (STALE_AFTER_HOURS - 1) * 3_600_000);
    const justStale = new Date(now.getTime() - (STALE_AFTER_HOURS + 1) * 3_600_000);
    const panel = (d: Date) => new Date(d.getTime() - 4 * 3_600_000).toISOString().slice(0, 19).replace("T", " ");
    expect(shouldTriggerSweep({ lastChecked: panel(justFresh), now }).trigger).toBe(false);
    expect(shouldTriggerSweep({ lastChecked: panel(justStale), now }).trigger).toBe(true);
  });

  it("treats a future timestamp as clock skew rather than a due sweep", () => {
    const d = shouldTriggerSweep({ lastChecked: "2026-09-09 04:00:00", now });
    expect(d.trigger).toBe(false);
    expect(d.reason).toMatch(/skew/i);
  });

  it("triggers on an unreadable timestamp instead of silently skipping", () => {
    const d = shouldTriggerSweep({ lastChecked: "not a date", now });
    expect(d.trigger).toBe(true);
    expect(d.reason).toMatch(/unreadable/i);
  });

  it("respects a caller-supplied window", () => {
    const d = shouldTriggerSweep({ lastChecked: "2026-09-07 00:00:00", now, staleAfterHours: 2 });
    expect(d.trigger).toBe(true); // 4h old against a 2h window
  });
});

describe("shouldTriggerSweep — partial weeks", () => {
  // Panel time is UTC-4, so a panel string is `now` minus the age minus 4h.
  const panelAged = (hours: number) =>
    new Date(now.getTime() - (hours + 4) * 3_600_000).toISOString().slice(0, 19).replace("T", " ");

  it("retries a thin week once the dead sweep has stopped progressing", () => {
    // 11 of 144 pairs is the 2026-09-07 sweep: it stopped, so waiting out the week is wrong.
    const d = shouldTriggerSweep({ lastChecked: panelAged(COVERAGE_RETRY_AFTER_HOURS + 1), now, coverage: 11 / 144 });
    expect(d.trigger).toBe(true);
    expect(d.reason).toMatch(/covers only 8%/);
  });

  it("leaves a thin week alone while a sweep could still be working through it", () => {
    const d = shouldTriggerSweep({ lastChecked: panelAged(3), now, coverage: 11 / 144 });
    expect(d.trigger).toBe(false);
    expect(d.reason).toMatch(/thin at 8%/);
  });

  it("does not retry a week that is covered well enough", () => {
    const d = shouldTriggerSweep({ lastChecked: panelAged(COVERAGE_RETRY_AFTER_HOURS + 1), now, coverage: 0.94 });
    expect(d.trigger).toBe(false);
  });

  it("ignores coverage it cannot judge (no previous week to compare)", () => {
    const d = shouldTriggerSweep({ lastChecked: panelAged(COVERAGE_RETRY_AFTER_HOURS + 1), now, coverage: null });
    expect(d.trigger).toBe(false);
  });

  it("still prefers the plain staleness reason once the full window passes", () => {
    const d = shouldTriggerSweep({ lastChecked: panelAged(STALE_AFTER_HOURS + 1), now, coverage: 0.1 });
    expect(d.trigger).toBe(true);
    expect(d.reason).toMatch(/stale after/);
  });
});

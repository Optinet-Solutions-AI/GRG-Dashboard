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
    // Panel 2026-09-07 04:00 === 08:00Z === now, which is after the 09-02 weekly slot.
    const d = shouldTriggerSweep({ lastChecked: "2026-09-07 04:00:00", now });
    expect(d.trigger).toBe(false);
    expect(d.reason).toMatch(/already checked since the weekly slot/i);
  });

  it("triggers once the last check predates the weekly slot", () => {
    // 2026-08-31 04:00 panel === 2026-08-31T08:00Z, before the Wednesday 09-02 slot.
    const d = shouldTriggerSweep({ lastChecked: "2026-08-31 04:00:00", now });
    expect(d.trigger).toBe(true);
    expect(d.reason).toMatch(/weekly slot/i);
  });

  it("keeps the staleness ceiling for a tracker that goes quiet inside one week", () => {
    // A check taken just after a Wednesday slot satisfies the weekly rule, so only the
    // staleness ceiling can still fire — it is the backstop for a tracker gone silent.
    const panel = (utcIso: string) =>
      new Date(Date.parse(utcIso) - 4 * 3_600_000).toISOString().slice(0, 19).replace("T", " ");
    const justAfterSlot = panel("2026-09-02T07:00:00Z");
    // Tuesday 09-08: same weekly slot (09-02), but the check is now 145h old.
    const stale = shouldTriggerSweep({ lastChecked: justAfterSlot, now: new Date("2026-09-08T08:00:00Z") });
    expect(stale.trigger).toBe(true);
    expect(stale.reason).toMatch(new RegExp(`stale after ${STALE_AFTER_HOURS}h`));
    // A day earlier the same check is 121h old — inside the ceiling, and past the slot.
    const fresh = shouldTriggerSweep({ lastChecked: justAfterSlot, now: new Date("2026-09-07T08:00:00Z") });
    expect(fresh.trigger).toBe(false);
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

  it("reports the weekly slot as the reason once a whole week has passed", () => {
    const d = shouldTriggerSweep({ lastChecked: panelAged(STALE_AFTER_HOURS + 1), now, coverage: 0.1 });
    expect(d.trigger).toBe(true);
    expect(d.reason).toMatch(/weekly slot/);
  });
});

describe("shouldTriggerSweep — the weekly Wednesday slot", () => {
  // Panel timestamps are UTC-4, so a panel string is the UTC moment minus 4h.
  const panel = (utcIso: string) =>
    new Date(Date.parse(utcIso) - 4 * 3_600_000).toISOString().slice(0, 19).replace("T", " ");

  it("fires on Wednesday when the last check predates the slot", () => {
    const d = shouldTriggerSweep({
      lastChecked: panel("2026-09-15T10:00:00Z"), // Tuesday
      now: new Date("2026-09-16T06:05:00Z"), // Wednesday, just after the slot
    });
    expect(d.trigger).toBe(true);
    expect(d.reason).toMatch(/weekly slot \(2026-09-16T06:00Z\)/);
  });

  it("does not fire again later the same week", () => {
    const d = shouldTriggerSweep({
      lastChecked: panel("2026-09-16T07:00:00Z"), // checked right after the slot
      now: new Date("2026-09-18T06:00:00Z"), // Friday
    });
    expect(d.trigger).toBe(false);
    expect(d.reason).toMatch(/already checked since the weekly slot/);
  });

  it("catches up on Thursday when Wednesday's run never happened", () => {
    // The whole point of anchoring rather than matching on the weekday.
    const d = shouldTriggerSweep({
      lastChecked: panel("2026-09-15T10:00:00Z"),
      now: new Date("2026-09-17T06:00:00Z"), // Thursday
    });
    expect(d.trigger).toBe(true);
  });

  it("waits when Wednesday's hour hasn't arrived yet", () => {
    const d = shouldTriggerSweep({
      lastChecked: panel("2026-09-10T06:30:00Z"), // last Thursday, after the 09-09 slot
      now: new Date("2026-09-16T05:00:00Z"), // Wednesday 05:00, slot opens at 06:00
    });
    expect(d.trigger).toBe(false);
  });

  it("still re-fires early for a sweep that died half-way", () => {
    const d = shouldTriggerSweep({
      lastChecked: panel("2026-09-16T07:00:00Z"),
      now: new Date("2026-09-18T08:00:00Z"), // 49h later, same week
      coverage: 11 / 144,
    });
    expect(d.trigger).toBe(true);
    expect(d.reason).toMatch(/covers only 8%/);
  });
});

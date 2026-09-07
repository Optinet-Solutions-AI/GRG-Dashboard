import { describe, it, expect } from "vitest";
import { shouldTriggerSweep, STALE_AFTER_HOURS } from "./sweep";

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

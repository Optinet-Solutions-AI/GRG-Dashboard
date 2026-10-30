import { describe, it, expect } from "vitest";
import { runOutcome } from "./psi-outcome.mjs";

/**
 * Why this exists: between 2026-09-16 and 2026-10-30 this script failed every single night
 * and told its scheduler it had succeeded — it printed "Updated 0 URL(s)" and exited 0. Six
 * weeks of empty cards, and the only way to notice was to look at the dashboard and feel
 * that something was missing.
 *
 * A run that captured nothing is a failed run, and has to say so in the only language a
 * scheduler reads: the exit code.
 */
describe("runOutcome", () => {
  it("fails loudly when nothing at all was captured", () => {
    const o = runOutcome({ attempted: 3, captured: 0 });
    expect(o.exitCode).toBe(1);
    expect(o.ok).toBe(false);
  });

  // The six weeks happened because this case was indistinguishable from success.
  it("names the usual cause when every single capture failed", () => {
    expect(runOutcome({ attempted: 3, captured: 0 }).message).toMatch(/automation|browser/i);
  });

  it("fails when only some sites were captured, rather than passing quietly", () => {
    const o = runOutcome({ attempted: 3, captured: 2 });
    expect(o.exitCode).toBe(1);
    expect(o.message).toMatch(/2 of 3/);
  });

  it("succeeds when every site was captured", () => {
    const o = runOutcome({ attempted: 3, captured: 3 });
    expect(o.exitCode).toBe(0);
    expect(o.ok).toBe(true);
  });

  // Filtering to one site that doesn't exist is a no-op, not a failure.
  it("treats having nothing to do as success", () => {
    expect(runOutcome({ attempted: 0, captured: 0 }).exitCode).toBe(0);
  });
});

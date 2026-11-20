import { describe, it, expect } from "vitest";
import {
  DISCOVERY_SELECT, MIN_CALL_UNITS, ROWS_PER_CALL, UNITS_PER_ROW,
  callCost, cycleCost, affordable, overcharged, COST_MARGIN_UNITS,
} from "./cost";

/**
 * Unlike the rankings sync, which only ever calls endpoints Ahrefs does not charge for, this
 * one SPENDS units — and it spends them on the same key the rankings sync depends on, whose
 * monthly cap is 10,000. If a cycle ever exhausted that key, the Wednesday rankings pull
 * could go with it. So the arithmetic is pinned down here and checked before any call.
 *
 * Ahrefs' rule, from the API docs and confirmed against a free test target on 2026-11-20:
 * a call costs max(50, per-row cost × rows), and the per-row cost is the sum of each unique
 * field named in select/where/order_by. Most fields cost 1; `volume` costs 10.
 */
describe("the price list", () => {
  it("charges 14 a row for what we ask for — measured, not assumed", () => {
    // keyword + keyword_country + best_position + best_position_url = 4, volume = 10.
    expect(UNITS_PER_ROW).toBe(14);
    expect(DISCOVERY_SELECT.split(",")).toHaveLength(5);
  });

  it("keeps the per-row fields and the select in step", () => {
    const fields = DISCOVERY_SELECT.split(",");
    const expected = fields.reduce((sum, f) => sum + (f === "volume" ? 10 : 1), 0);
    expect(UNITS_PER_ROW).toBe(expected);
  });
});

describe("callCost", () => {
  it("prices a full page at rows × the row cost", () => {
    expect(callCost(25)).toBe(350);
  });

  // Ahrefs bills a minimum per call, so a market with two results is not nearly free.
  it("never prices a call below Ahrefs' minimum", () => {
    expect(callCost(1)).toBe(MIN_CALL_UNITS);
    expect(callCost(0)).toBe(MIN_CALL_UNITS);
  });
});

describe("cycleCost", () => {
  it("prices a whole cycle as every site in every market", () => {
    // 3 sites × 6 markets at 25 rows each.
    expect(cycleCost(3, 6)).toBe(18 * callCost(ROWS_PER_CALL));
  });

  it("stays inside the 10,000 the shared key allows", () => {
    expect(cycleCost(3, 6)).toBeLessThan(10_000);
  });
});

describe("affordable", () => {
  const need = cycleCost(3, 6);

  it("allows a cycle the key can pay for", () => {
    expect(affordable({ limit: 10_000, used: 0 }, need).ok).toBe(true);
  });

  // The guard that protects the rankings key: stop BEFORE spending, not after.
  it("refuses when the remaining allowance would not cover the cycle", () => {
    const r = affordable({ limit: 10_000, used: 7_000 }, need);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/3,?000 units left/i);
  });

  it("refuses when Ahrefs reports no limit information at all", () => {
    expect(affordable(null, need).ok).toBe(false);
  });

  it("counts a key already over its limit as nothing left", () => {
    expect(affordable({ limit: 10_000, used: 12_000 }, need).ok).toBe(false);
  });
});

describe("overcharged", () => {
  it("accepts a charge the rows explain", () => {
    expect(overcharged(350, 25)).toBe(false);
  });

  it("tolerates a small difference rather than halting on rounding", () => {
    expect(overcharged(350 + COST_MARGIN_UNITS, 25)).toBe(false);
  });

  // If Ahrefs changes its pricing we want to stop, not quietly drain the key.
  it("flags a charge the rows cannot explain", () => {
    expect(overcharged(350 + COST_MARGIN_UNITS + 1, 25)).toBe(true);
  });
});

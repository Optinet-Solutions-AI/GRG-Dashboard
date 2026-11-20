/**
 * What the discovery pull costs, and whether we can afford it.
 *
 * The rankings sync is free: it only calls Ahrefs endpoints that charge no API units, and
 * `ahrefs-api.ts` is built to keep it that way. This feature is the opposite — Site Explorer's
 * organic-keywords report spends units, and it spends them on the SAME key the rankings sync
 * uses, which carries a 10,000-unit monthly cap. Exhausting that key is the one failure that
 * would take the Wednesday rankings down with it, so nothing here is estimated after the fact:
 * the cycle is priced and checked against the remaining allowance before the first call.
 *
 * Prices confirmed against Ahrefs' own headers on 2026-11-20, using their free test target so
 * the check itself cost nothing: `x-api-units-cost-row: 14`, `x-api-units-cost-total: 700` for
 * 50 rows.
 */

/** Fields the pull asks for. Every one of them is priced, including those only ordered by. */
export const DISCOVERY_SELECT = "keyword,keyword_country,best_position,best_position_url,volume";

/** `volume` costs 10 units a row; the rest cost 1 each. */
export const UNITS_PER_ROW = DISCOVERY_SELECT.split(",").reduce((sum, f) => sum + (f === "volume" ? 10 : 1), 0);

/** Ahrefs bills at least this per call, however few rows come back. */
export const MIN_CALL_UNITS = 50;

/**
 * Keywords fetched per site per market. Ahrefs' own default is 50; this is half that, which
 * keeps a full cycle (3 sites × 6 markets) inside the shared key's cap with room to spare.
 */
export const ROWS_PER_CALL = 25;

/** How far a charge may exceed what its rows explain before the run stops. */
export const COST_MARGIN_UNITS = 50;

export function callCost(rows: number = ROWS_PER_CALL): number {
  return Math.max(MIN_CALL_UNITS, UNITS_PER_ROW * Math.max(0, rows));
}

export function cycleCost(sites: number, markets: number): number {
  return sites * markets * callCost(ROWS_PER_CALL);
}

export type KeyAllowance = { limit: number; used: number } | null;

/**
 * Whether the key can pay for the whole cycle. Deliberately all-or-nothing: half a cycle shown
 * as a brand's list makes keywords look as though they vanished, and buying half of it still
 * spends the key the rankings sync needs.
 */
export function affordable(allowance: KeyAllowance, needed: number): { ok: boolean; reason?: string } {
  if (!allowance) return { ok: false, reason: "Ahrefs did not report this key's unit allowance." };
  const left = Math.max(0, allowance.limit - allowance.used);
  if (left < needed) {
    return {
      ok: false,
      reason: `This cycle needs ${needed.toLocaleString("en-GB")} units and the key has ${left.toLocaleString("en-GB")} units left of ${allowance.limit.toLocaleString("en-GB")}. Stopping before spending any, because the rankings sync depends on this key.`,
    };
  }
  return { ok: true };
}

/** True when Ahrefs charged more than the rows can explain — a sign its pricing changed. */
export function overcharged(unitsCharged: number, rows: number): boolean {
  return unitsCharged > callCost(rows) + COST_MARGIN_UNITS;
}

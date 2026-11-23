import { describe, it, expect } from "vitest";
import { targetsToPrune, PRUNE_MIN_KEYWORDS } from "./prune-targets";

/**
 * Ahrefs decides which keywords a site has. Anything else on the dashboard is a leftover —
 * from the old hand-kept sheet, or from a keyword since dropped in Ahrefs — and it shows every
 * week as a row that will never be checked. On 2026-11-23 there were 84 such rows across the
 * three sites: 18 on .com, 34 on .org, 32 on .net.
 *
 * The danger in automating removal is a thin reply. If Ahrefs answers with two keywords
 * because a call half-failed, "remove everything else" would strip the roster to two. So
 * pruning refuses on a reply too small to be the truth.
 */
const target = (id: string, text: string) => ({ id, keyword: text });

describe("targetsToPrune", () => {
  const ahrefs = ["تجميد حساب التداول", "مشاكل سحب التداول", "gulf recovery group"];
  const many = (n: number) => Array.from({ length: n }, (_, i) => `kw ${i}`);

  it("removes a target Ahrefs does not track", () => {
    const targets = [target("1", "تجميد حساب التداول"), target("2", "خسرت كل شيء في التداول ماذا أفعل")];
    expect(targetsToPrune(targets, [...ahrefs, ...many(PRUNE_MIN_KEYWORDS)])).toEqual(["2"]);
  });

  it("keeps everything Ahrefs tracks", () => {
    const targets = ahrefs.map((k, i) => target(String(i), k));
    expect(targetsToPrune(targets, [...ahrefs, ...many(PRUNE_MIN_KEYWORDS)])).toEqual([]);
  });

  it("matches on spacing and case, so a retyped keyword is not treated as a stranger", () => {
    const targets = [target("1", "  Gulf   Recovery  Group ")];
    expect(targetsToPrune(targets, [...ahrefs, ...many(PRUNE_MIN_KEYWORDS)])).toEqual([]);
  });

  // The guard that matters: never let a half-failed fetch empty the dashboard.
  it("prunes nothing when Ahrefs replied with implausibly few keywords", () => {
    const targets = [target("1", "something old"), target("2", "something older")];
    expect(targetsToPrune(targets, ["just one"])).toEqual([]);
  });

  it("prunes nothing when Ahrefs replied with none at all", () => {
    expect(targetsToPrune([target("1", "anything")], [])).toEqual([]);
  });

  it("removes several at once, which is the real case", () => {
    const targets = [
      target("a", "تجميد حساب التداول"),
      target("b", "هل يمكن استرجاع USDT بعد الاحتيال"),
      target("c", "كيف أسترجع USDT حولتها لمحتال"),
    ];
    expect(targetsToPrune(targets, [...ahrefs, ...many(PRUNE_MIN_KEYWORDS)]).sort()).toEqual(["b", "c"]);
  });
});

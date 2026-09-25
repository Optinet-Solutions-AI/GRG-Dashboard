import { describe, it, expect } from "vitest";
import { keywordEnglish } from "./keyword-labels";

// Pinned against the client's own reference translations (2026-09-25). These are the
// labels a reader sees beside each Arabic keyword, so a silent drift here mislabels the
// whole ranking grid.
describe("keywordEnglish — main keywords", () => {
  const expected: Array<[string, string]> = [
    ["استرجاع أموال التداول", "Recovering trading funds"],
    ["مشاكل سحب التداول", "Trading withdrawal issues"],
    ["تجميد حساب التداول", "Frozen trading account"],
    ["علامات نصب التداول", "Signs of a trading scam"],
    ["وسيط تداول لا يرد", "Unresponsive trading broker"],
    ["استرداد خسائر التداول", "Recovering trading losses"],
    ["استرجاع أموال الفوركس", "Recovering Forex funds"],
    ["احتيال منصات التداول", "Trading platform fraud"],
  ];
  for (const [ar, en] of expected) {
    it(`${ar} → ${en}`, () => expect(keywordEnglish(ar)).toBe(en));
  }

  it("does not describe the recovery lawyer as acting for the brokers", () => {
    // "Lawyer for trading companies" read as counsel on the other side.
    const label = keywordEnglish("محامي شركات التداول");
    expect(label).toBe("Trading company lawyer");
    expect(label).not.toMatch(/for trading companies/i);
  });

  it("falls back to an empty string for an untracked keyword rather than guessing", () => {
    expect(keywordEnglish("كلمة غير مسجلة")).toBe("");
  });
});

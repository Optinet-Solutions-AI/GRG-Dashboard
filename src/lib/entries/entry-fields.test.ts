import { describe, it, expect } from "vitest";
import { buildEntryRecord, parseIsoDate, SEO_FIELDS, HEALTH_FIELDS, PAGESPEED_FIELDS } from "./entry-fields";

const from = (o: Record<string, string>) => (name: string) => o[name] ?? null;

describe("parseIsoDate", () => {
  it("accepts a valid ISO date", () => {
    expect(parseIsoDate("2026-09-04", "Date")).toEqual({ ok: true, value: "2026-09-04" });
  });
  it("rejects a blank date", () => {
    const r = parseIsoDate("", "Date");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Date is required");
  });
  it("rejects a malformed date", () => {
    expect(parseIsoDate("04/09/2026", "Date").ok).toBe(false);
  });
  it("rejects a date that does not exist on the calendar", () => {
    // Postgres would reject this too; catching it here gives a readable message.
    const r = parseIsoDate("2026-02-31", "Date");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not a real date/i);
  });
  it("accepts a leap day in a leap year", () => {
    expect(parseIsoDate("2028-02-29", "Date").ok).toBe(true);
  });
  it("rejects a leap day in a non-leap year", () => {
    expect(parseIsoDate("2026-02-29", "Date").ok).toBe(false);
  });
});

describe("buildEntryRecord", () => {
  it("builds a full SEO record, keeping decimals in every numeric field", () => {
    const r = buildEntryRecord(SEO_FIELDS, from({
      date: "2026-09-04", seo_score: "87.5", passed_tests: "42.5", warnings: "3", failed_tests: "1",
    }));
    expect(r).toEqual({
      ok: true,
      record: { date: "2026-09-04", seo_score: 87.5, passed_tests: 42.5, warnings: 3, failed_tests: 1 },
    });
  });

  it("turns blank optional numbers into null rather than zero", () => {
    const r = buildEntryRecord(SEO_FIELDS, from({ date: "2026-09-04", seo_score: "", passed_tests: "" }));
    expect(r.ok && r.record.seo_score).toBeNull();
    expect(r.ok && r.record.passed_tests).toBeNull();
  });

  it("fails on a bad date before touching the numbers", () => {
    const r = buildEntryRecord(SEO_FIELDS, from({ date: "nope", seo_score: "87.5" }));
    expect(r.ok).toBe(false);
  });

  it("accepts a decimal in a tally field (the columns are numeric, not integer)", () => {
    const r = buildEntryRecord(SEO_FIELDS, from({ date: "2026-09-04", warnings: "3.5" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.record.warnings).toBe(3.5);
  });

  it("still rejects a negative tally", () => {
    const r = buildEntryRecord(SEO_FIELDS, from({ date: "2026-09-04", warnings: "-1" }));
    expect(r.ok).toBe(false);
  });

  it("still rejects text in a numeric field", () => {
    const r = buildEntryRecord(SEO_FIELDS, from({ date: "2026-09-04", passed_tests: "abc" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Passed must be a number");
  });

  it("enforces the 0-100 range on scores", () => {
    const r = buildEntryRecord(SEO_FIELDS, from({ date: "2026-09-04", seo_score: "120" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/between 0 and 100/);
  });

  it("only reads fields in the spec, so extra form values cannot be persisted", () => {
    const r = buildEntryRecord(SEO_FIELDS, from({ date: "2026-09-04", site_id: "somebody-elses", role: "admin" }));
    expect(r.ok && Object.keys(r.record)).toEqual(["date", "seo_score", "passed_tests", "warnings", "failed_tests"]);
  });

  it("accepts decimals across every PageSpeed score column", () => {
    const vals: Record<string, string> = { date: "2026-09-04" };
    for (const f of PAGESPEED_FIELDS) if (f.name !== "date") vals[f.name] = "61.5";
    const r = buildEntryRecord(PAGESPEED_FIELDS, from(vals));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.record.mobile_score).toBe(61.5);
    if (r.ok) expect(r.record.desktop_seo).toBe(61.5);
  });

  it("accepts decimals across every health metric", () => {
    const vals: Record<string, string> = { date: "2026-09-04" };
    for (const f of HEALTH_FIELDS) if (f.name !== "date") vals[f.name] = "12.5";
    const r = buildEntryRecord(HEALTH_FIELDS, from(vals));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.record.domain_rating).toBe(12.5);
    if (r.ok) expect(r.record.organic_traffic).toBe(12.5);
  });

  it("has no whole-number-only fields left, so no form can reject a decimal", () => {
    for (const spec of [...SEO_FIELDS, ...PAGESPEED_FIELDS, ...HEALTH_FIELDS]) {
      expect(spec.kind === "integer").toBe(false);
    }
  });

  it("includes the date in the health spec, which the old update action omitted", () => {
    expect(HEALTH_FIELDS.some((f) => f.name === "date")).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { buildRow } from "./build-row";
import type { Field } from "./entities";

const fields: Field[] = [
  { name: "domain", label: "Domain", type: "text", required: true },
  { name: "global_volume", label: "Vol", type: "number" },
  { name: "active", label: "Active", type: "boolean", defaultValue: true },
  { name: "site_id", label: "Site", type: "site", required: true },
];

describe("buildRow", () => {
  it("coerces types and trims text", () => {
    const { data, errors } = buildRow(fields, {
      domain: "  trybet.io ", global_volume: "1500", active: "on", site_id: "abc-123",
    });
    expect(errors).toEqual([]);
    expect(data).toEqual({ domain: "trybet.io", global_volume: 1500, active: true, site_id: "abc-123" });
  });
  it("treats missing checkbox as false and empty number as null", () => {
    const { data } = buildRow(fields, { domain: "x", site_id: "s", global_volume: "" });
    expect(data.active).toBe(false);
    expect(data.global_volume).toBeNull();
  });
  it("reports required-field errors and omits unknown keys", () => {
    const { data, errors } = buildRow(fields, { domain: "  ", site_id: "s", hacker: "drop table" });
    expect(errors).toContain("Domain is required");
    expect(Object.keys(data)).not.toContain("hacker");
  });
  it("rejects a non-numeric number field", () => {
    const { errors } = buildRow(fields, { domain: "x", site_id: "s", global_volume: "abc" });
    expect(errors).toContain("Vol must be a number");
  });
  it("keeps a decimal in a number field instead of rejecting or truncating it", () => {
    // Every numeric column the manage forms write is numeric(_,2), so 1500.7 is a
    // valid value. parseInt used to store 1500; parseIntegerField used to error.
    const { errors, data } = buildRow(fields, { domain: "x", site_id: "s", global_volume: "1500.7" });
    expect(errors).toEqual([]);
    expect(data.global_volume).toBe(1500.7);
  });
  it("rounds to the 2 decimal places the columns hold", () => {
    const { data } = buildRow(fields, { domain: "x", site_id: "s", global_volume: "1500.789" });
    expect(data.global_volume).toBe(1500.79);
  });
});

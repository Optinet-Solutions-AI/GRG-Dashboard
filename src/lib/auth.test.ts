import { describe, it, expect } from "vitest";
import { isAdminRole } from "./auth";

describe("isAdminRole", () => {
  it("is true only for 'admin'", () => {
    expect(isAdminRole("admin")).toBe(true);
  });
  it("is false for viewer / null / unknown", () => {
    expect(isAdminRole("viewer")).toBe(false);
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
    expect(isAdminRole("Admin")).toBe(false);
  });
});

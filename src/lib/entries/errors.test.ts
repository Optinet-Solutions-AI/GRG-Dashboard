import { describe, it, expect } from "vitest";
import { duplicateDateMessage } from "./errors";

describe("duplicateDateMessage", () => {
  it("turns a unique-violation into a readable message naming the record", () => {
    const msg = duplicateDateMessage(
      { code: "23505", message: 'duplicate key value violates unique constraint "seo_scores_site_id_date_key"' },
      "SEO entry",
    );
    expect(msg).toBe("This site already has a SEO entry on that date. Edit or delete that one instead.");
  });
  it("passes any other database error through unchanged", () => {
    const msg = duplicateDateMessage({ code: "42501", message: "permission denied" }, "SEO entry");
    expect(msg).toBe("permission denied");
  });
  it("recognises a unique violation reported only in the message text", () => {
    const msg = duplicateDateMessage({ message: "duplicate key value violates unique constraint x" }, "health entry");
    expect(msg).toMatch(/already has a health entry on that date/);
  });
  it("falls back to a generic message when there is no text at all", () => {
    expect(duplicateDateMessage({}, "SEO entry")).toBe("Could not save the SEO entry.");
  });
});

import { describe, it, expect } from "vitest";
import { uploadMode } from "./psi-upload-mode.mjs";

/**
 * The same script runs in two places now: by hand here, where the Supabase keys are in
 * .env, and on a schedule in the cloud, where they deliberately are not — there it posts to
 * the dashboard instead, holding only the shared secret. Choosing wrongly is quiet and
 * expensive: a cloud run with no database key would fail every night, which is exactly the
 * failure this whole exercise was about.
 */
describe("uploadMode", () => {
  it("posts to the dashboard when an endpoint and its secret are configured", () => {
    const m = uploadMode({ PROOF_UPLOAD_URL: "https://dash.example/api/pagespeed/proof", CRON_SECRET: "s3cret" });
    expect(m).toEqual({ mode: "endpoint", url: "https://dash.example/api/pagespeed/proof", secret: "s3cret" });
  });

  it("writes to the database directly when no endpoint is configured", () => {
    expect(uploadMode({ SUPABASE_SERVICE_ROLE_KEY: "k", NEXT_PUBLIC_SUPABASE_URL: "u" }).mode).toBe("database");
  });

  // Half a configuration is the dangerous case: it would silently fall back to a database
  // write that cannot work in the cloud, and fail nightly for the reason nobody is looking at.
  it("refuses an endpoint without its secret rather than falling back", () => {
    expect(() => uploadMode({ PROOF_UPLOAD_URL: "https://dash.example/x" })).toThrow(/CRON_SECRET/);
  });

  it("refuses a database write with no key to write with", () => {
    expect(() => uploadMode({})).toThrow(/SUPABASE|PROOF_UPLOAD_URL/);
  });
});

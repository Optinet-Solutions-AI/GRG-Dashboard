import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";
});

describe("createBrowserSupabaseClient", () => {
  it("returns a client with auth and from()", async () => {
    const { createBrowserSupabaseClient } = await import("./client");
    const client = createBrowserSupabaseClient();
    expect(client).toBeDefined();
    expect(typeof client.from).toBe("function");
    expect(client.auth).toBeDefined();
  });
});

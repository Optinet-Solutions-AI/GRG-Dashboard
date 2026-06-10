import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Map screenshot paths to public URLs. The `screenshots` bucket is public
 * (migration 0015) so this needs NO service-role key — display works on any
 * deployment regardless of which env vars are set.
 */
export async function signScreenshots(paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const out = new Map<string, string>();
  for (const p of new Set(paths.filter((p): p is string => !!p))) {
    out.set(p, `${base}/storage/v1/object/public/screenshots/${p.split("/").map(encodeURIComponent).join("/")}`);
  }
  return out;
}

// Minimal interface accepted for both session and service-role clients.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StorageClient = { storage: { from(bucket: string): any } };

/**
 * Upload a screenshot File to the screenshots bucket.
 *
 * Pass `client` (from createServerSupabaseClient) when calling from a server
 * action — the admin's own RLS identity performs the upload; no service-role
 * key needed in Vercel. Omit only when calling from scripts/Cloud Run (where
 * there is no user session and the service-role key IS available).
 */
export async function uploadScreenshot(path: string, file: File, client?: StorageClient): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const sc: StorageClient = client ?? createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { error } = await sc.storage.from("screenshots").upload(path, buf, {
    contentType: file.type || "image/png",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return path;
}

/** Upload a raw Buffer (Cloud Run / local scripts only — no user session). Server-only. */
export async function uploadImageBuffer(path: string, buffer: Buffer, contentType: string): Promise<string> {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { error } = await admin.storage.from("screenshots").upload(path, buffer, { contentType, upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

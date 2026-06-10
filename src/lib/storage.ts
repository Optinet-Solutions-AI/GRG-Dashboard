import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Map screenshot paths to public URLs. The `screenshots` bucket is public
 * (migration 0015) so this needs NO service-role key — display works on any
 * deployment regardless of which env vars are set. Kept async + same shape so
 * existing call sites are unchanged.
 */
export async function signScreenshots(paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const out = new Map<string, string>();
  for (const p of new Set(paths.filter((p): p is string => !!p))) {
    out.set(p, `${base}/storage/v1/object/public/screenshots/${p.split("/").map(encodeURIComponent).join("/")}`);
  }
  return out;
}

/** Upload a screenshot File (from a form) to the private bucket; returns the stored path. Server-only. */
export async function uploadScreenshot(path: string, file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { error } = await admin.storage.from("screenshots").upload(path, buf, {
    contentType: file.type || "image/png",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return path;
}

/** Upload a raw image Buffer (e.g. a PSI page screenshot) to the private bucket; returns the path. Server-only. */
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

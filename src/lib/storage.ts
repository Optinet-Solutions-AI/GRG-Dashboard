import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Batch-create short-lived signed URLs for private screenshots (service-role; server-only). */
export async function signScreenshots(paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const real = [...new Set(paths.filter((p): p is string => !!p))];
  const out = new Map<string, string>();
  if (real.length === 0) return out;
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data } = await admin.storage.from("screenshots").createSignedUrls(real, 3600);
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) out.set(item.path, item.signedUrl);
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

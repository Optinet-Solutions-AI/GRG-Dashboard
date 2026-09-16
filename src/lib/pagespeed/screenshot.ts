import "server-only";

/**
 * Store the screenshot PageSpeed Insights returns with every score.
 *
 * The high-fidelity proof — a picture of the PSI report page with its gauges — comes from
 * scripts/capture-psi-report.mjs, which drives a real browser and so can only run off
 * Vercel. That script scrapes Google's own UI, and when Google reworded a caption it failed
 * silently for two weeks, leaving every automated capture with no image at all.
 *
 * This is the floor beneath that: the PSI API already returns a rendered screenshot of the
 * page in the same response as the scores (`final-screenshot`), and both the cron and the
 * autofill action were throwing it away. Storing it means an automated capture always ships
 * with SOMETHING visual, from the same API call that produced the numbers, with nothing to
 * break when Google restyles a page.
 *
 * The two are deliberately distinguishable by filename — `-report-` for the gauges,
 * `-page-` for this — so the dashboard can caption each honestly and the report shot can
 * take precedence when both exist.
 */

type StorageClient = { storage: { from(bucket: string): { upload(path: string, body: Buffer, opts: { contentType: string; upsert: boolean }): Promise<{ error: { message: string } | null }> } } };

/** `data:image/jpeg;base64,…` (what PSI returns) → a Buffer plus its extension. */
export function decodeDataUrl(dataUrl: string): { buffer: Buffer; ext: string; contentType: string } | null {
  const m = /^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  const contentType = m[1].toLowerCase();
  const ext = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1];
  try {
    return { buffer: Buffer.from(m[3], "base64"), ext, contentType };
  } catch {
    return null;
  }
}

export function pageShotPath(urlId: string, strategy: string, date: string, ext: string): string {
  return `pagespeed/${urlId}-${strategy}-page-${date}.${ext}`;
}

/** True when a stored path is the PSI report (gauges), not a plain page render. */
export function isReportShot(path: string | null | undefined): boolean {
  return typeof path === "string" && /-report-/.test(path);
}

/**
 * Upload one PSI page screenshot. Returns the stored path, or null if there was nothing
 * usable — a missing image must never fail the capture that carries the scores.
 */
export async function storePsiScreenshot(
  db: StorageClient,
  opts: { urlId: string; strategy: string; date: string; dataUrl: string | null | undefined },
): Promise<string | null> {
  if (!opts.dataUrl) return null;
  const decoded = decodeDataUrl(opts.dataUrl);
  if (!decoded) return null;
  const path = pageShotPath(opts.urlId, opts.strategy, opts.date, decoded.ext);
  try {
    const { error } = await db.storage.from("screenshots").upload(path, decoded.buffer, {
      contentType: decoded.contentType,
      upsert: true,
    });
    return error ? null : path;
  } catch {
    return null;
  }
}

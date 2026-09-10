import "server-only";

export type PsiKick = { dispatched: boolean; target: string; detail: string };

// One PSI pass costs ~50s from the deployment region against a 60s function limit, so the
// capture can't run inside the daily ranking invocation — it has to be its own. Requesting
// the route over HTTP starts a separate invocation with its own 60s budget; we abort our
// side of the connection after a moment and let that one finish on its own.
const DISPATCH_WAIT_MS = 2_500;

function baseUrl(): string | null {
  const explicit = process.env.PSI_KICK_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  // VERCEL_PROJECT_PRODUCTION_URL is the stable production host; VERCEL_URL is this
  // deployment's own hostname, which still works but pins the call to one deployment.
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return host ? `https://${host}` : null;
}

/**
 * Ask the PageSpeed route to capture whichever tracked URL has waited longest.
 *
 * Fire-and-forget by design: a timeout here means the capture is running, not that it
 * failed. Called once a day from the ranking cron, this rotates through every tracked URL
 * — which is what .org and .net never got before (six automated runs, all .com).
 */
export async function kickPagespeedCapture(opts: { batch?: number } = {}): Promise<PsiKick> {
  const base = baseUrl();
  if (!base) {
    return { dispatched: false, target: "", detail: "no base URL — set PSI_KICK_BASE_URL to enable the daily capture" };
  }
  const target = `${base}/api/cron/pagespeed${opts.batch ? `?batch=${opts.batch}` : ""}`;
  const secret = process.env.CRON_SECRET;

  try {
    const res = await fetch(target, {
      headers: secret ? { Authorization: `Bearer ${secret}` } : {},
      cache: "no-store",
      signal: AbortSignal.timeout(DISPATCH_WAIT_MS),
    });
    // Fast reply = nothing was pending, or it failed outright. Either way it's finished.
    const body = (await res.json().catch(() => null)) as { refreshed?: unknown; remaining?: number } | null;
    return {
      dispatched: res.ok,
      target,
      detail: res.ok
        ? `finished within ${DISPATCH_WAIT_MS} ms — ${JSON.stringify(body?.refreshed ?? body ?? {})}`
        : `PageSpeed route returned HTTP ${res.status}`,
    };
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return { dispatched: true, target, detail: "capture is running in its own invocation" };
    }
    return { dispatched: false, target, detail: e instanceof Error ? e.message : "could not reach the PageSpeed route" };
  }
}

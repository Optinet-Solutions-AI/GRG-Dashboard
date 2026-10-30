// Where this run should send what it captures.
//
// Run by hand from the repo, the Supabase keys are in .env and it writes straight to the
// database. Run on a schedule in the cloud, it has no database key on purpose — a nightly
// job does not need a full-access credential to attach one screenshot — and posts to the
// dashboard's proof endpoint with the shared secret instead.
//
// A half-configuration is the trap: an endpoint with no secret would quietly fall back to a
// database write that cannot work there, and fail every night in exactly the silent way this
// whole fix was about. So it throws instead.

/** @param {Record<string, string | undefined>} env */
export function uploadMode(env) {
  const url = env.PROOF_UPLOAD_URL?.trim();
  if (url) {
    const secret = env.CRON_SECRET?.trim();
    if (!secret) throw new Error("PROOF_UPLOAD_URL is set but CRON_SECRET is not — the endpoint would reject every post.");
    return { mode: "endpoint", url, secret };
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim() || !env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    throw new Error("Set PROOF_UPLOAD_URL + CRON_SECRET to post to the dashboard, or the SUPABASE_* vars to write directly.");
  }
  return { mode: "database" };
}

/** The URL list, from the dashboard — the job has no database key to read it itself. */
export async function fetchTrackedUrls({ url, secret }) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
  const text = await res.text();
  if (!res.ok) throw new Error(`proof endpoint returned HTTP ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text).urls ?? [];
}

/** Post one captured report. Throws with the endpoint's own message so a bad run is readable. */
export async function postProof({ url, secret }, { pageUrl, strategy, scores, buffer }) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: pageUrl, strategy, scores, imageBase64: buffer.toString("base64") }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`proof endpoint returned HTTP ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

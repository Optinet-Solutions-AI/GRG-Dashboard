/**
 * What the proof-upload endpoint will accept.
 *
 * The nightly capture needs a real browser, which Vercel cannot run, so it runs elsewhere
 * and posts its result here. Giving that job the Supabase service-role key would put a
 * full-access database credential wherever the job lives; posting to a narrow endpoint
 * instead keeps the key in Vercel and limits the job to exactly this one action.
 *
 * Everything below arrives from outside, authorised only by a shared secret, so it is all
 * checked. In particular the caller never names the file it writes — the route builds that
 * path from the URL's own row id.
 */
export type Strategy = "mobile" | "desktop";

export type ProofRequest = {
  url: string;
  strategy: Strategy;
  scores: { performance: number | null; accessibility: number | null; bestPractices: number | null; seo: number | null };
  image: Buffer;
};

export type ParseResult = { ok: true; value: ProofRequest } | { ok: false; error: string };

/** A report screenshot is ~100KB; a megabyte is already far more than one can be. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SCORE_KEYS = ["performance", "accessibility", "bestPractices", "seo"] as const;

function parseScore(value: unknown, key: string): number | null | { error: string } {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return { error: `${key} must be a number or null.` };
  const n = Math.round(value);
  // The column has a 0-100 check constraint; catching it here gives a usable error instead
  // of a database rejection after the upload has already happened.
  if (n < 0 || n > 100) return { error: `${key} must be between 0 and 100.` };
  return n;
}

export function parseProofRequest(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Body must be a JSON object." };
  const b = body as Record<string, unknown>;

  const url = typeof b.url === "string" ? b.url.trim() : "";
  if (!url) return { ok: false, error: "url is required." };

  if (b.strategy !== "mobile" && b.strategy !== "desktop") {
    return { ok: false, error: "strategy must be 'mobile' or 'desktop'." };
  }

  const rawScores = (typeof b.scores === "object" && b.scores !== null ? b.scores : {}) as Record<string, unknown>;
  const scores = {} as ProofRequest["scores"];
  for (const key of SCORE_KEYS) {
    const parsed = parseScore(rawScores[key], key);
    if (typeof parsed === "object" && parsed !== null) return { ok: false, error: parsed.error };
    scores[key] = parsed;
  }

  if (typeof b.imageBase64 !== "string" || !b.imageBase64) return { ok: false, error: "imageBase64 is required." };
  const image = Buffer.from(b.imageBase64, "base64");
  if (image.length > MAX_IMAGE_BYTES) {
    return { ok: false, error: `Image too large: ${image.length} bytes, limit is ${MAX_IMAGE_BYTES}.` };
  }
  // Base64 will happily encode anything; only a PNG belongs in the screenshots bucket.
  if (!image.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    return { ok: false, error: "imageBase64 is not a PNG." };
  }

  return { ok: true, value: { url, strategy: b.strategy, scores, image } };
}

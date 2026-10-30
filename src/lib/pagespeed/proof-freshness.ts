/**
 * How long it has been since a PageSpeed card got its proof image.
 *
 * The scores and the image arrive by different routes: the scores automatically, the image
 * from a browser script on a machine. When the image route broke on 2026-09-16 the page
 * carried on looking healthy — fresh scores every day — and the gap went unnoticed for six
 * weeks. Nothing in the product said the proof had stopped.
 *
 * This is deliberately about the IMAGE and not about the scores, because that is the half
 * that can fail quietly.
 */
export type ProofEntry = {
  date: string;
  mobile_screenshot_path: string | null;
  desktop_screenshot_path: string | null;
};

/**
 * The capture runs nightly (.github/workflows/pagespeed-proof.yml), so three nights with
 * nothing stored is a fault, not a quiet patch. This was 20 when captures came round once
 * per 15-day cycle; leaving it there would have meant a fortnight of silence on a job that
 * now tries every night — the same mistake in slower motion.
 *
 * One missed night is tolerated: PSI itself has bad evenings.
 */
export const PROOF_STALE_AFTER_DAYS = 3;

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function proofFreshness(
  entries: ProofEntry[],
  today: string,
): { lastProof: string | null; daysSince: number | null; stale: boolean } {
  const dated = entries
    .filter((e) => e.mobile_screenshot_path || e.desktop_screenshot_path)
    .map((e) => e.date)
    .sort();
  const lastProof = dated.at(-1) ?? null;
  // A site that has never had one has nothing to be stale about; warning there is noise.
  if (!lastProof) return { lastProof: null, daysSince: null, stale: false };
  const daysSince = daysBetween(lastProof, today);
  return { lastProof, daysSince, stale: daysSince > PROOF_STALE_AFTER_DAYS };
}

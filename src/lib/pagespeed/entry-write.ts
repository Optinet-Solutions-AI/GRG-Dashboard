/**
 * The score half of a PageSpeed entry.
 *
 * A day's card is written by two different things: the nightly browser capture, which
 * stores Google's report image and the scores read off it, and the admin "Auto-fill from
 * PSI" button, which fetches scores from the API. They have to land on the SAME row — when
 * auto-fill inserted its own row instead, the captured one was buried and the card lost its
 * proof image while the image sat in storage unreferenced.
 *
 * Landing on the same row means auto-fill now UPDATES it, which is why this returns scores
 * and nothing else: a patch carrying a screenshot key would blank the very image the row
 * was keeping.
 */
export type PsiStrategyScores = {
  score: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
};

export function scoreFields(
  mobile: PsiStrategyScores | undefined,
  desktop: PsiStrategyScores | undefined,
): Record<string, number | null> {
  return {
    mobile_score: mobile?.score ?? null,
    mobile_accessibility: mobile?.accessibility ?? null,
    mobile_best_practices: mobile?.bestPractices ?? null,
    mobile_seo: mobile?.seo ?? null,
    desktop_score: desktop?.score ?? null,
    desktop_accessibility: desktop?.accessibility ?? null,
    desktop_best_practices: desktop?.bestPractices ?? null,
    desktop_seo: desktop?.seo ?? null,
  };
}

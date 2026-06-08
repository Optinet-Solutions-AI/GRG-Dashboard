export type Strategy = "mobile" | "desktop";

export interface PageSpeedResult {
  strategy: Strategy;
  score: number | null; // 0–100, or null if unavailable
}

/** Base marker for any data-source adapter (manual sections need no adapter). */
export interface MetricSource {
  readonly id: string;
}

/** A source that returns PageSpeed performance scores for a URL. */
export interface PageSpeedSource extends MetricSource {
  fetchScores(url: string): Promise<PageSpeedResult[]>;
}

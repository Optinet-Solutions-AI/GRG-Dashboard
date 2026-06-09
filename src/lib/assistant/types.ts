export type QuestionId =
  | "ranking-changes"
  | "focus-keywords"
  | "top-mover-week"
  | "missing-or-stale"
  | "pagespeed-trend"
  | "backlinks-summary"
  | "seo-summary"
  | "health-summary";

export interface AssistantContext {
  siteId?: string | null;
}

export interface InsightProvider {
  readonly id: string;
  answer(questionId: QuestionId, ctx: AssistantContext): Promise<string>;
}

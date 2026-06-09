export type QuestionId =
  | "ranking-changes"
  | "top-mover-week"
  | "missing-or-stale"
  | "pagespeed-trend"
  | "health-summary";

export interface AssistantContext {
  siteId?: string | null;
}

export interface InsightProvider {
  readonly id: string;
  answer(questionId: QuestionId, ctx: AssistantContext): Promise<string>;
}

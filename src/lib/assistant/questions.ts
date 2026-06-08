import type { QuestionId } from "./types";

export const QUESTIONS: { id: QuestionId; label: string }[] = [
  { id: "top-mover-week", label: "Which site improved most this week?" },
  { id: "missing-or-stale", label: "What data is missing or stale?" },
  { id: "pagespeed-trend", label: "Is PageSpeed up or down vs last period?" },
  { id: "health-summary", label: "Give me a health summary" },
];

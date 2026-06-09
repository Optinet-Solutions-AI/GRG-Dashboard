"use server";

import { getInsightProvider } from "@/lib/assistant/provider";
import { matchQuestion } from "@/lib/assistant/match";
import type { QuestionId } from "@/lib/assistant/types";

const VALID: QuestionId[] = ["ranking-changes", "focus-keywords", "top-mover-week", "missing-or-stale", "pagespeed-trend", "backlinks-summary", "seo-summary", "health-summary"];

export async function askAssistant(
  _prev: { answer?: string; error?: string } | undefined,
  formData: FormData,
): Promise<{ answer?: string; error?: string }> {
  // Read-only insights over already-public data — usable by anonymous viewers too.
  // Accepts either a chip (questionId) or free text (q), matched tokenlessly to a known answer.
  const raw = String(formData.get("questionId") ?? "");
  const q = String(formData.get("q") ?? "").trim();
  let questionId: QuestionId | null = VALID.includes(raw as QuestionId) ? (raw as QuestionId) : null;
  if (!questionId && q) questionId = matchQuestion(q);
  if (!questionId) {
    return {
      answer:
        "I can answer questions about your data — for example: “what changed in the rankings?”, “which keywords should I focus on?”, “how many backlinks do we have?”, “what's my SEO score?”, “how is PageSpeed trending?”, “show domain rating and organic traffic”, or “what data is stale?”. Try rephrasing your question around one of those.",
    };
  }
  const siteId = String(formData.get("siteId") ?? "") || null;
  try {
    return { answer: await getInsightProvider().answer(questionId, { siteId }) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not answer that." };
  }
}

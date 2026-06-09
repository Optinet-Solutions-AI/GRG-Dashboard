"use server";

import { getInsightProvider } from "@/lib/assistant/provider";
import { matchQuestion } from "@/lib/assistant/match";
import type { QuestionId } from "@/lib/assistant/types";

const VALID: QuestionId[] = ["ranking-changes", "top-mover-week", "missing-or-stale", "pagespeed-trend", "health-summary"];

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
        "I can answer about ranking changes, top movers, missing/stale data, the PageSpeed trend, and a health summary — tap a suggestion or rephrase your question.",
    };
  }
  const siteId = String(formData.get("siteId") ?? "") || null;
  try {
    return { answer: await getInsightProvider().answer(questionId, { siteId }) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not answer that." };
  }
}

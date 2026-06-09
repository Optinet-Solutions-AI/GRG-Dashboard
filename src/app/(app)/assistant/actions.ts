"use server";

import { getInsightProvider } from "@/lib/assistant/provider";
import { smartAnswer } from "@/lib/assistant/smart";
import type { QuestionId } from "@/lib/assistant/types";

const VALID: QuestionId[] = ["ranking-changes", "focus-keywords", "top-mover-week", "missing-or-stale", "pagespeed-trend", "backlinks-summary", "seo-summary", "health-summary"];

export async function askAssistant(
  _prev: { answer?: string; error?: string } | undefined,
  formData: FormData,
): Promise<{ answer?: string; error?: string }> {
  // Read-only insights over already-public data — usable by anonymous viewers too.
  // Tokenless (no LLM): every answer is COMPUTED from the database, so it can't
  // hallucinate. Free text goes through the smart NLU engine; a preset chip
  // (questionId), if ever used, routes to the deterministic rule provider.
  const raw = String(formData.get("questionId") ?? "");
  const q = String(formData.get("q") ?? "").trim();
  const siteId = String(formData.get("siteId") ?? "") || null;

  try {
    if (VALID.includes(raw as QuestionId)) {
      return { answer: await getInsightProvider().answer(raw as QuestionId, { siteId }) };
    }
    if (q) {
      return { answer: await smartAnswer(q, siteId) };
    }
    return { answer: "Ask me anything about your rankings, backlinks, PageSpeed, SEO, site health, QA pages, or data freshness." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not answer that." };
  }
}

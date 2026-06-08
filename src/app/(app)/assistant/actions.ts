"use server";

import { requireUser } from "@/lib/auth";
import { getInsightProvider } from "@/lib/assistant/provider";
import type { QuestionId } from "@/lib/assistant/types";

const VALID: QuestionId[] = ["top-mover-week", "missing-or-stale", "pagespeed-trend", "health-summary"];

export async function askAssistant(
  _prev: { answer?: string; error?: string } | undefined,
  formData: FormData,
): Promise<{ answer?: string; error?: string }> {
  await requireUser();
  const questionId = String(formData.get("questionId") ?? "") as QuestionId;
  if (!VALID.includes(questionId)) return { error: "Unknown question." };
  const siteId = String(formData.get("siteId") ?? "") || null;
  try {
    const answer = await getInsightProvider().answer(questionId, { siteId });
    return { answer };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not answer that." };
  }
}

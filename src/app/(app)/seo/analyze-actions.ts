"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { runSeoAnalysis } from "@/lib/seo-analyzer/run";

export type AnalyzeResult = { ok?: boolean; message?: string; error?: string };

/** Compute and store today's SEO score for one site (.org / .net only). */
export async function analyzeSeoNow(siteId: string): Promise<AnalyzeResult> {
  await requireAdmin();
  try {
    const [result] = await runSeoAnalysis({ siteId });
    if (!result) return { error: "Site not found." };
    if (result.skipped) return { error: result.skipped };
    revalidatePath("/seo");
    return {
      ok: true,
      message: `${result.displayName}: ${result.score}/100 — ${result.passed} passed, ${result.warnings} warnings, ${result.failed} failed (stored for ${result.date}).`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "SEO analysis failed." };
  }
}

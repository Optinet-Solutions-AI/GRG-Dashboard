"use client";

import { useState, useTransition } from "react";
import { analyzeSeoNow, type AnalyzeResult } from "@/app/(app)/seo/analyze-actions";

/**
 * Runs the built-in analyzer for a site Rank Math can't reach (.org / .net) and stores
 * today's score. .com never gets this button — its score is Rank Math's, typed in by hand.
 */
export function AnalyzeSeo({ siteId, siteName }: { siteId: string; siteName: string }) {
  const [state, setState] = useState<AnalyzeResult | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-700">Computed SEO score for {siteName}:</span>
        <button
          type="button"
          onClick={() => start(async () => setState(await analyzeSeoNow(siteId)))}
          disabled={pending}
          className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Analyzing…" : "Run SEO analysis"}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        This site has no Rank Math, so the score is computed here: the homepage is fetched and graded against the same
        class of site-wide tests Rank Math&apos;s SEO Analyzer runs. It is an approximation of Rank Math&apos;s number,
        not the same number — compare a site against its own history rather than against .com.
        It refreshes on its own on the <strong>1st and the 16th</strong>, the same rhythm as the PageSpeed snapshots;
        this button scores it now without waiting.
      </p>
      {state?.message ? <p className="mt-2 text-sm text-slate-700">{state.message}</p> : null}
      {state?.error ? <p className="mt-2 text-sm text-red-600">{state.error}</p> : null}
    </div>
  );
}

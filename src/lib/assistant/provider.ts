import "server-only";
import type { InsightProvider } from "./types";
import { ruleProvider } from "./rule-provider";
// import { llmProvider } from "./llm-provider"; // enable when an LLM is configured

/** Tokenless rule provider by default. Swap here when an LLM provider is wired. */
export function getInsightProvider(): InsightProvider {
  return ruleProvider;
}

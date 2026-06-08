import "server-only";
import type { InsightProvider } from "./types";

/** Seam for a future free-form LLM provider (e.g. Claude). Intentionally inert. */
export const llmProvider: InsightProvider = {
  id: "llm",
  async answer() {
    throw new Error("LLM provider not configured. Implement a client and set ASSISTANT_PROVIDER=llm.");
  },
};

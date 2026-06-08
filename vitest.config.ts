import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // The read-only reference clone ships its own tests with deps we don't install here.
    exclude: ["**/node_modules/**", "**/.reference/**", "**/dist/**"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // server-only throws at import time in non-server environments; stub it in tests.
      "server-only": fileURLToPath(new URL("./src/__mocks__/server-only.ts", import.meta.url)),
    },
  },
});

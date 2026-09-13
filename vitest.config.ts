import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  // Next preserves JSX for its own compiler; component tests need executable JSX.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)),
    },
  },
  test: {
    coverage: {
      enabled: false,
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
    },
    include: [
      "packages/**/src/**/*.test.{ts,tsx}",
      "apps/**/src/**/*.test.{ts,tsx}",
    ],
    passWithNoTests: false,
  },
});

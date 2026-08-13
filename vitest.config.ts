import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
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
    include: ["packages/**/src/**/*.test.ts", "apps/**/src/**/*.test.ts"],
    passWithNoTests: false,
  },
});

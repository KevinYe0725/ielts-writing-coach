import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@iwc/exchange": fileURLToPath(
        new URL("../../packages/exchange/src/index.ts", import.meta.url),
      ),
      "@iwc/learning-contracts": fileURLToPath(
        new URL(
          "../../packages/learning-contracts/src/index.ts",
          import.meta.url,
        ),
      ),
      "@iwc/learning-core": fileURLToPath(
        new URL("../../packages/learning-core/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["tests/quality/**/*.test.ts"],
    passWithNoTests: false,
  },
});

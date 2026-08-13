import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL("..", import.meta.url)),
  test: {
    environment: "node",
    include: [
      "scripts/compose-operations.test.ts",
      "scripts/verify-compose-backup-restore.test.ts",
    ],
  },
});

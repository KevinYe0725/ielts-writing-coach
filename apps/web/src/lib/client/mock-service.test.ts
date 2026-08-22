import { afterEach, describe, expect, it, vi } from "vitest";

import { MockLearningClient } from "./mock-service";

function testStorage(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial));
  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } satisfies Storage;
}

describe("browser-only Demo administration boundary", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not let localStorage override Admin role, health, or access", async () => {
    const localStorage = testStorage({
      "iwc.demo.admin-status-fixture": JSON.stringify({
        access: "forbidden",
        actorRole: "admin",
        migrationsCurrent: false,
      }),
    });
    vi.stubGlobal("window", { localStorage, setTimeout });

    await expect(
      new MockLearningClient().getSystemStatus(),
    ).resolves.toMatchObject({
      actorRole: "owner",
      databaseState: "healthy",
      migrationsCurrent: true,
    });
  });
});

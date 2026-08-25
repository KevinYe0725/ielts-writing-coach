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

  it("deletes recommendation state from both browser stores while retaining preferences", async () => {
    const recommendationKeys = [
      "iwc.demo.selected-recommendation",
      "iwc.demo.question-recommendation-active",
      "iwc.demo.question-recommendation-exposure",
      "iwc.demo.question-recommendation-state",
      "iwc.demo.question-recommendation-swap",
      "iwc.demo.question-recommendation-cooldown",
    ];
    const localStorage = testStorage({
      ...Object.fromEntries(recommendationKeys.map((key) => [key, "local"])),
      "iwc.demo.preferences": JSON.stringify({ locale: "en" }),
      "iwc.demo.search-connection": "unrelated-connection",
    });
    const sessionStorage = testStorage({
      ...Object.fromEntries(recommendationKeys.map((key) => [key, "session"])),
      "iwc.demo.navigation": "unrelated-navigation",
    });
    vi.stubGlobal("window", { localStorage, sessionStorage, setTimeout });

    await new MockLearningClient().deleteLearningData();

    for (const key of recommendationKeys) {
      expect(localStorage.getItem(key)).toBeNull();
      expect(sessionStorage.getItem(key)).toBeNull();
    }
    expect(localStorage.getItem("iwc.demo.preferences")).toBe(
      JSON.stringify({ locale: "en" }),
    );
    expect(localStorage.getItem("iwc.demo.search-connection")).toBe(
      "unrelated-connection",
    );
    expect(sessionStorage.getItem("iwc.demo.navigation")).toBe(
      "unrelated-navigation",
    );
  });

  it("durably abandons Demo exposure and makes the question selectable again", async () => {
    const localStorage = testStorage({});
    const sessionStorage = testStorage({});
    vi.stubGlobal("window", { localStorage, sessionStorage, setTimeout });
    const client = new MockLearningClient();
    const first = await client.requestQuestionRecommendation({
      action: "INITIAL",
    });
    expect(first.state).toBe("READY");
    const abandon = (
      client as unknown as {
        abandonQuestionRecommendation?: (id: string) => Promise<void>;
      }
    ).abandonQuestionRecommendation;
    expect(abandon).toEqual(expect.any(Function));
    if (!abandon) return;

    await abandon.call(client, first.id);

    expect(
      JSON.parse(
        localStorage.getItem("iwc.demo.question-recommendation-active") ??
          "null",
      ),
    ).toEqual({ id: first.id, status: "ABANDONED" });
    expect(
      JSON.parse(
        localStorage.getItem("iwc.demo.question-recommendation-exposure") ??
          "null",
      ),
    ).toEqual([]);
    await expect(
      client.requestQuestionRecommendation({ action: "INITIAL" }),
    ).resolves.toMatchObject({
      state: "READY",
      id: first.id,
    });
  });
});

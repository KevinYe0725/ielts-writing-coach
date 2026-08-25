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

  it("couples Demo READY abandonment to cycle creation and preserves its cooldown", async () => {
    const localStorage = testStorage({});
    const sessionStorage = testStorage({});
    vi.stubGlobal("window", { localStorage, sessionStorage, setTimeout });
    const client = new MockLearningClient();
    const first = await client.requestQuestionRecommendation({
      action: "INITIAL",
    });
    expect(first.state).toBe("READY");
    if (first.state !== "READY") return;
    const start = (
      client as unknown as {
        startTrainingCycle: (
          questionId: string,
          options: { abandonRecommendationId: string },
        ) => Promise<string>;
      }
    ).startTrainingCycle;

    await expect(
      start.call(client, "manual-demo-question", {
        abandonRecommendationId: first.id,
      }),
    ).resolves.toBe("cycle-demo-selected");

    expect(
      JSON.parse(
        localStorage.getItem("iwc.demo.question-recommendation-active") ??
          "null",
      ),
    ).toMatchObject({ id: first.id, status: "ABANDONED" });
    expect(
      JSON.parse(
        localStorage.getItem("iwc.demo.question-recommendation-exposure") ??
          "null",
      ),
    ).toHaveLength(1);
    const next = await client.requestQuestionRecommendation({
      action: "INITIAL",
    });
    expect(next.state).toBe("READY");
    expect(next.id).not.toBe(first.id);
  });

  it("marks a Demo recommended start terminal STARTED inside cycle creation", async () => {
    const localStorage = testStorage({});
    vi.stubGlobal("window", {
      localStorage,
      sessionStorage: testStorage({}),
      setTimeout,
    });
    const client = new MockLearningClient();
    const ready = await client.requestQuestionRecommendation({
      action: "INITIAL",
    });
    expect(ready.state).toBe("READY");
    if (ready.state !== "READY") return;

    await client.startTrainingCycle(ready.question.id, {
      recommendationId: ready.id,
    });

    expect(
      JSON.parse(
        localStorage.getItem("iwc.demo.question-recommendation-active") ??
          "null",
      ),
    ).toMatchObject({ id: ready.id, status: "STARTED" });
  });
});

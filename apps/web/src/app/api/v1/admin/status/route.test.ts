import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { readServerEnvironment } from "@iwc/config";
import {
  auditEvent,
  createDatabase,
  newDomainId,
  question,
  questionGenerationBatch,
  questionRecommendation,
  searchConnection,
  user,
} from "@iwc/db";
import { QUESTION_BANK } from "@iwc/question-bank";

import type { SessionActor } from "@/lib/server/session";

const routeState = vi.hoisted(() => ({
  actor: null as SessionActor | null,
  context: null as unknown,
}));

vi.mock("@/lib/server/context", () => ({
  getServerContext: () => routeState.context,
}));

vi.mock("@/lib/server/readiness", () => ({
  inspectRuntimeReadiness: async () => ({
    ready: true,
    checks: {
      configuration: true,
      database: true,
      migrations: true,
      taskExecutor: true,
    },
  }),
}));

vi.mock("@/lib/server/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/session")>();
  return {
    ...actual,
    requireSession: async () => routeState.actor,
  };
});

import { GET } from "./route";

const databaseUrl =
  process.env.IWC_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)(
  "Admin question-supply status (PostgreSQL)",
  () => {
    const database = createDatabase(databaseUrl!);
    const suffix = newDomainId();
    const ownerId = `admin-supply-owner-${suffix}`;
    const searchConnectionId = newDomainId();
    const succeededBatchId = newDomainId();
    const latestBatchId = newDomainId();
    const dynamicQuestionId = newDomainId();
    const recommendationIds = [
      newDomainId(),
      newDomainId(),
      newDomainId(),
      newDomainId(),
    ];
    const auditEventId = newDomainId();
    const forbiddenValues = {
      ownerId,
      prompt: `private prompt ${suffix}`,
      providerResponse: `provider response ${suffix}`,
      snippet: `private snippet ${suffix}`,
      url: `https://research.example.test/${suffix}`,
      ciphertext: `encrypted-search-key-${suffix}`,
    };

    beforeAll(async () => {
      routeState.actor = {
        id: ownerId,
        email: `${suffix}@example.test`,
        name: "Question supply owner",
        role: "owner",
      };
      routeState.context = {
        db: database.db,
        pool: database.pool,
        environment: readServerEnvironment({
          NODE_ENV: "test",
          APP_URL: "https://coach.test",
          AUTH_SECRET: "a".repeat(32),
          APP_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64"),
          DATABASE_URL: databaseUrl!,
        }),
        mail: { configured: false },
      };
      await database.db.insert(user).values({
        id: ownerId,
        email: `${suffix}@example.test`,
        name: "Question supply owner",
        role: "owner",
      });
      await database.db.insert(searchConnection).values({
        id: searchConnectionId,
        configuredByUserId: ownerId,
        kind: "BRAVE",
        encryptedApiKey: forbiddenValues.ciphertext,
        encryptedApiKeyNonce: Buffer.alloc(12, 7).toString("base64"),
        encryptionKeyVersion: 1,
        status: "ACTIVE",
      });
      await database.db.insert(questionGenerationBatch).values([
        {
          id: succeededBatchId,
          triggeredByUserId: ownerId,
          status: "SUCCEEDED",
          mode: "OFFLINE",
          targetMix: [],
          researchSources: [],
          promptVersion: "question-bank-refill@1.0.0",
          rubricVersion: "iwc-question-bank-refill-1.0.0",
          acceptedCount: 1,
          rejectedCount: 0,
          createdAt: new Date("2026-08-24T10:00:00.000Z"),
          updatedAt: new Date("2026-08-24T10:00:00.000Z"),
        },
        {
          id: latestBatchId,
          triggeredByUserId: ownerId,
          status: "FAILED",
          mode: "WEB_RESEARCH",
          targetMix: [
            {
              questionType: "opinion",
              topic: "education",
              count: 3,
              prompt: forbiddenValues.prompt,
              providerResponse: forbiddenValues.providerResponse,
            },
          ] as unknown as (typeof questionGenerationBatch.$inferInsert)["targetMix"],
          researchSources: [
            {
              url: forbiddenValues.url,
              title: "Private source title",
              snippet: forbiddenValues.snippet,
            },
          ],
          searchConnectionId,
          promptVersion: "question-bank-refill@1.0.0",
          rubricVersion: "iwc-question-bank-refill-1.0.0",
          acceptedCount: 7,
          rejectedCount: 2,
          safeFailureCode: "AI_UNAVAILABLE",
          createdAt: new Date("2099-08-25T12:00:00.000Z"),
          updatedAt: new Date("2099-08-25T12:00:00.000Z"),
        },
      ]);
      await database.db.insert(question).values({
        id: dynamicQuestionId,
        externalId: `iwc-dynamic-admin-${suffix}`,
        ownerId: null,
        source: "AI_GENERATED",
        visibility: "public",
        ieltsTrack: "academic",
        questionType: "opinion",
        topic: "education",
        prompt:
          "Should schools provide more practical decision-making lessons?",
        generationBatchId: succeededBatchId,
      });
      await database.db.insert(questionRecommendation).values([
        {
          id: recommendationIds[0],
          userId: ownerId,
          questionExternalId: `iwc-dynamic-admin-${suffix}`,
          action: "INITIAL",
          status: "READY",
          shownAt: new Date(),
        },
        {
          id: recommendationIds[1],
          userId: ownerId,
          generationBatchId: latestBatchId,
          action: "SWAP",
          status: "PENDING",
        },
        {
          id: recommendationIds[2],
          userId: ownerId,
          action: "INITIAL",
          status: "UNAVAILABLE",
          safeFailureCode: "QUESTION_SUPPLY_UNAVAILABLE",
        },
        {
          id: recommendationIds[3],
          userId: ownerId,
          action: "INITIAL",
          status: "ABANDONED",
        },
      ]);
      await database.db.insert(auditEvent).values({
        id: auditEventId,
        actorId: ownerId,
        action: "account.recovery_link.create",
        targetType: "user",
        targetId: ownerId,
        result: "success",
        occurredAt: new Date("2099-08-25T12:00:01.000Z"),
      });
    });

    afterAll(async () => {
      await database.db
        .delete(auditEvent)
        .where(eq(auditEvent.id, auditEventId));
      await database.db
        .delete(questionRecommendation)
        .where(eq(questionRecommendation.userId, ownerId));
      await database.db
        .delete(question)
        .where(eq(question.id, dynamicQuestionId));
      await database.db
        .delete(questionGenerationBatch)
        .where(eq(questionGenerationBatch.triggeredByUserId, ownerId));
      await database.db
        .delete(searchConnection)
        .where(eq(searchConnection.id, searchConnectionId));
      await database.db.delete(user).where(eq(user.id, ownerId));
      await database.pool.end();
    });

    it("returns only aggregate supply counts and the latest batch safe projection", async () => {
      const response = await GET(
        new Request("https://coach.test/api/v1/admin/status"),
      );
      const body = (await response.json()) as Record<string, unknown>;

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        question_supply: {
          eligible_question_count: QUESTION_BANK.length + 1,
          recommendations: {
            READY: expect.any(Number),
            PENDING: expect.any(Number),
            UNAVAILABLE: expect.any(Number),
          },
          latest_batch: {
            status: "FAILED",
            mode: "WEB_RESEARCH",
            accepted_count: 7,
            rejected_count: 2,
            safe_failure_code: "AI_UNAVAILABLE",
          },
        },
      });
      const recommendations = (
        body.question_supply as {
          recommendations: Record<string, number>;
        }
      ).recommendations;
      expect(recommendations.READY).toBeGreaterThanOrEqual(1);
      expect(recommendations.PENDING).toBeGreaterThanOrEqual(1);
      expect(recommendations.UNAVAILABLE).toBeGreaterThanOrEqual(1);
      expect(Object.keys(recommendations).sort()).toEqual([
        "PENDING",
        "READY",
        "UNAVAILABLE",
      ]);

      const serialized = JSON.stringify(body.question_supply);
      for (const value of Object.values(forbiddenValues)) {
        expect(serialized).not.toContain(value);
      }
      expect(serialized).not.toContain(searchConnectionId);
      expect(serialized).not.toContain(latestBatchId);
      expect(serialized).not.toContain("encrypted_api_key");
      expect(serialized).not.toContain("research_sources");
      expect(serialized).not.toContain("triggered_by_user_id");
      expect(JSON.stringify(body)).not.toContain(ownerId);
      const recoveryAudit = (
        body.recent_audit as Array<Record<string, unknown>>
      ).find((event) => event.action === "account.recovery_link.create");
      expect(recoveryAudit).toMatchObject({
        action: "account.recovery_link.create",
        target_type: "user",
        result: "success",
      });
      expect(recoveryAudit).not.toHaveProperty("target_id");
    });

    it.each(["AI_UNAVAILABLE", "QUESTION_VALIDATION_REJECTED"])(
      "projects the producer-owned batch failure code %s",
      async (knownCode) => {
        await database.db
          .update(questionGenerationBatch)
          .set({ safeFailureCode: knownCode })
          .where(eq(questionGenerationBatch.id, latestBatchId));

        const response = await GET(
          new Request("https://coach.test/api/v1/admin/status"),
        );
        const body = (await response.json()) as {
          question_supply: {
            latest_batch: { safe_failure_code: string | null };
          };
        };

        expect(response.status).toBe(200);
        expect(body.question_supply.latest_batch.safe_failure_code).toBe(
          knownCode,
        );
      },
    );

    it.each([
      "SEARCH_UNAVAILABLE",
      "ai_unavailable",
      "sk-redacted-credential-shaped-value",
    ])(
      "fails closed for unknown batch failure value %#",
      async (unknownCode) => {
        await database.db
          .update(questionGenerationBatch)
          .set({ safeFailureCode: unknownCode })
          .where(eq(questionGenerationBatch.id, latestBatchId));
        try {
          const response = await GET(
            new Request("https://coach.test/api/v1/admin/status"),
          );
          const body = (await response.json()) as {
            question_supply: {
              latest_batch: { safe_failure_code: string | null };
            };
          };

          expect(response.status).toBe(200);
          expect(
            body.question_supply.latest_batch.safe_failure_code,
          ).toBeNull();
          expect(JSON.stringify(body.question_supply)).not.toContain(
            unknownCode,
          );
        } finally {
          await database.db
            .update(questionGenerationBatch)
            .set({ safeFailureCode: "AI_UNAVAILABLE" })
            .where(eq(questionGenerationBatch.id, latestBatchId));
        }
      },
    );
  },
);

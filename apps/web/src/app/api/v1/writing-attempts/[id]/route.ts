import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { trainingCycle, writingAttempt, writingAttemptRevision } from "@iwc/db";

import { getServerContext } from "@/lib/server/context";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
import { parseDomainId, parseJsonBody } from "@/lib/server/request";
import { requireSession } from "@/lib/server/session";
import {
  completeIdempotentResponse,
  protectMutation,
  reserveIdempotencyKey,
  settleIdempotentError,
} from "@/lib/server/security";
import {
  countEssayWords,
  parseRevisionHeader,
  revisionEtag,
} from "@/lib/server/writing";

const patchSchema = z
  .object({
    content: z.string().max(50_000),
    client_id: z.string().min(1).max(200).optional(),
    draft_before_self_check: z.string().max(50_000).optional(),
    draft_after_self_check: z.string().max(50_000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    for (const field of [
      "draft_before_self_check",
      "draft_after_self_check",
    ] as const) {
      if (value[field] !== undefined && value[field] !== value.content) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "A rewrite snapshot must exactly match the submitted draft.",
        });
      }
    }
  });

export const GET = apiRoute(
  async (request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireSession(request);
    const { id: rawId } = await context.params;
    const id = parseDomainId(rawId, "attempt_id");
    const { db } = getServerContext();
    const attempt = await db.query.writingAttempt.findFirst({
      where: and(
        eq(writingAttempt.id, id),
        eq(writingAttempt.userId, actor.id),
      ),
      with: { cycle: { with: { question: true } } },
    });
    if (!attempt)
      throw new ApiProblem({
        title: "Attempt not found",
        status: 404,
        code: "ATTEMPT_NOT_FOUND",
        detail: "The writing attempt does not exist.",
      });
    return Response.json(
      { attempt },
      {
        headers: {
          etag: revisionEtag(attempt.revision),
          "cache-control": "no-store",
        },
      },
    );
  },
);

export const PATCH = apiRoute(
  async (request, context: { params: Promise<{ id: string }> }) => {
    protectMutation(request);
    const actor = await requireSession(request);
    const { id: rawId } = await context.params;
    const id = parseDomainId(rawId, "attempt_id");
    const payload = await parseJsonBody(request, patchSchema, {
      maximumBytes: 160 * 1_024,
    });
    const expectedRevision = parseRevisionHeader(
      request.headers.get("if-match"),
    );
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      throw new ApiProblem({
        title: "Revision required",
        status: 428,
        code: "IF_MATCH_REQUIRED",
        detail: "Supply the latest attempt ETag in If-Match.",
      });
    }
    const { db } = getServerContext();
    const wordCount = countEssayWords(payload.content);
    const reservation = await reserveIdempotencyKey(db, actor.id, request, {
      attemptId: id,
      expectedRevision,
      payload,
    });
    if (reservation.replay) return reservation.replay;
    try {
      const result = await db.transaction(async (transaction) => {
        const [attempt] = await transaction
          .select()
          .from(writingAttempt)
          .where(
            and(eq(writingAttempt.id, id), eq(writingAttempt.userId, actor.id)),
          )
          .for("update");
        if (!attempt)
          throw new ApiProblem({
            title: "Attempt not found",
            status: 404,
            code: "ATTEMPT_NOT_FOUND",
            detail: "The writing attempt does not exist.",
          });
        if (attempt.lockedAt)
          throw new ApiProblem({
            title: "Attempt locked",
            status: 423,
            code: "ATTEMPT_LOCKED",
            detail: "A submitted writing attempt cannot be edited.",
          });
        const wantsRewriteSnapshot =
          payload.draft_before_self_check !== undefined ||
          payload.draft_after_self_check !== undefined;
        if (wantsRewriteSnapshot && attempt.kind !== "version_2") {
          throw new ApiProblem({
            title: "Rewrite snapshot not allowed",
            status: 409,
            code: "SNAPSHOT_NOT_ALLOWED",
            detail: "Self-check snapshots are only valid for Version 2.",
          });
        }
        if (
          payload.draft_before_self_check !== undefined &&
          attempt.draftBeforeSelfCheck !== null &&
          attempt.draftBeforeSelfCheck !== payload.draft_before_self_check
        ) {
          throw new ApiProblem({
            title: "Rewrite snapshot already sealed",
            status: 409,
            code: "SNAPSHOT_IMMUTABLE",
            detail:
              "The closed-book snapshot cannot be replaced after goals are revealed.",
          });
        }
        if (
          payload.draft_after_self_check !== undefined &&
          attempt.draftAfterSelfCheck !== null &&
          attempt.draftAfterSelfCheck !== payload.draft_after_self_check
        ) {
          throw new ApiProblem({
            title: "Rewrite snapshot already sealed",
            status: 409,
            code: "SNAPSHOT_IMMUTABLE",
            detail:
              "The post-check snapshot cannot be replaced after submission evidence is sealed.",
          });
        }
        if (
          payload.draft_after_self_check !== undefined &&
          attempt.draftBeforeSelfCheck === null &&
          payload.draft_before_self_check === undefined
        ) {
          throw new ApiProblem({
            title: "Closed-book snapshot required",
            status: 409,
            code: "BEFORE_SNAPSHOT_REQUIRED",
            detail:
              "Seal the closed-book draft before saving the post-check draft.",
          });
        }
        const cycle = await transaction.query.trainingCycle.findFirst({
          where: eq(trainingCycle.id, attempt.cycleId),
        });
        if (
          !cycle ||
          (cycle.status !== "ATTEMPT_1_ACTIVE" &&
            cycle.status !== "ATTEMPT_2_ACTIVE")
        ) {
          throw new ApiProblem({
            title: "Attempt not active",
            status: 409,
            code: "ATTEMPT_NOT_ACTIVE",
            detail: "The training cycle is not accepting edits.",
          });
        }
        if (attempt.revision !== expectedRevision) {
          const [conflict] = await transaction
            .insert(writingAttemptRevision)
            .values({
              attemptId: attempt.id,
              revision: attempt.revision + 1,
              baseRevision: expectedRevision,
              content: payload.content,
              wordCount,
              branch: "conflict",
              clientId: payload.client_id,
            })
            .returning({ id: writingAttemptRevision.id });
          return { conflict: true as const, attempt, conflictId: conflict?.id };
        }
        const nextRevision = attempt.revision + 1;
        const [updated] = await transaction
          .update(writingAttempt)
          .set({
            content: payload.content,
            wordCount,
            revision: nextRevision,
            ...(payload.draft_before_self_check === undefined
              ? {}
              : { draftBeforeSelfCheck: payload.draft_before_self_check }),
            ...(payload.draft_after_self_check === undefined
              ? {}
              : { draftAfterSelfCheck: payload.draft_after_self_check }),
          })
          .where(
            and(
              eq(writingAttempt.id, attempt.id),
              eq(writingAttempt.revision, expectedRevision),
            ),
          )
          .returning();
        if (!updated)
          throw new Error("The writing revision update lost its row lock.");
        await transaction.insert(writingAttemptRevision).values({
          attemptId: attempt.id,
          revision: nextRevision,
          baseRevision: expectedRevision,
          content: payload.content,
          wordCount,
          branch: "canonical",
          clientId: payload.client_id,
        });
        return { conflict: false as const, attempt: updated };
      });
      if (result.conflict) {
        throw new ApiProblem({
          title: "Draft conflict",
          status: 409,
          code: "DRAFT_REVISION_CONFLICT",
          detail:
            "The server and client drafts were both preserved. Choose which text to keep.",
          server: {
            revision: result.attempt.revision,
            content: result.attempt.content,
            word_count: result.attempt.wordCount,
          },
          client: {
            base_revision: expectedRevision,
            content: payload.content,
            word_count: wordCount,
            conflict_id: result.conflictId,
          },
        });
      }
      const responseBody = {
        attempt: {
          id: result.attempt.id,
          revision: result.attempt.revision,
          word_count: result.attempt.wordCount,
          updated_at: result.attempt.updatedAt,
        },
      };
      await completeIdempotentResponse(
        db,
        actor.id,
        reservation.key,
        200,
        responseBody,
      );
      return Response.json(responseBody, {
        headers: {
          etag: revisionEtag(result.attempt.revision),
          "cache-control": "no-store",
        },
      });
    } catch (error) {
      return settleIdempotentError(db, actor.id, reservation.key, error);
    }
  },
);

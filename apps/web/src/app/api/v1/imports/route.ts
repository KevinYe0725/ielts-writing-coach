import { BundleArchiveError, readCycleBundleArchive } from "@iwc/exchange";

import {
  importCycleBundle,
  type BundleImportResult,
} from "@/lib/server/cycle-bundle";
import { readBoundedRequestBody } from "@/lib/server/bounded-body";
import { getServerContext } from "@/lib/server/context";
import { ApiProblem, apiRoute } from "@/lib/server/problem";
import { requireSession } from "@/lib/server/session";
import {
  completeIdempotentResponse,
  protectMutation,
  reserveIdempotencyKey,
} from "@/lib/server/security";

const MAX_BYTES = 20 * 1024 * 1024;

export const POST = apiRoute(async (request) => {
  protectMutation(request);
  const actor = await requireSession(request);
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const bytes = await readBoundedRequestBody(request, MAX_BYTES);
  let bundle: unknown;
  if (contentType.includes("application/json")) {
    try {
      bundle = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
    } catch {
      throw new ApiProblem({
        title: "Invalid import",
        status: 400,
        code: "IMPORT_JSON_INVALID",
        detail: "The import body must be valid UTF-8 JSON.",
      });
    }
  } else {
    try {
      bundle = readCycleBundleArchive(bytes);
    } catch (error) {
      if (error instanceof BundleArchiveError) {
        throw new ApiProblem({
          title: "Invalid bundle archive",
          status: 400,
          code: error.code,
          detail: error.message,
        });
      }
      throw error;
    }
  }
  const identity = bundle as {
    manifest?: { bundleId?: unknown };
    checksum?: { value?: unknown };
  };
  const { db } = getServerContext();
  const reservation = await reserveIdempotencyKey(db, actor.id, request, {
    bundleId: identity.manifest?.bundleId,
    checksum: identity.checksum?.value,
  });
  if (reservation.replay) return reservation.replay;
  let result: BundleImportResult;
  try {
    result = await importCycleBundle(db, actor.id, bundle);
  } catch (error) {
    if (error instanceof ApiProblem) {
      await completeIdempotentResponse(
        db,
        actor.id,
        reservation.key,
        error.problem.status,
        error.problem,
      );
    }
    throw error;
  }
  const responseBody = {
    imported: result.imported,
    idempotent: result.idempotent,
    cycle_id: result.cycleId,
    bundle_id: result.bundleId,
    conflicts: [],
  };
  const status = result.imported ? 201 : 200;
  await completeIdempotentResponse(
    db,
    actor.id,
    reservation.key,
    status,
    responseBody,
  );
  return Response.json(responseBody, {
    status,
    headers: {
      location: `/api/v1/training-cycles/${result.cycleId}`,
      "cache-control": "no-store",
    },
  });
});

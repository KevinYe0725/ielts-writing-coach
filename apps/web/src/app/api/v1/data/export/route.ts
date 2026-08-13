import { assertNoSecrets, createLearningRecordArchive } from "@iwc/exchange";
import { z } from "zod";

import { getServerContext } from "@/lib/server/context";
import {
  buildLearningRecord,
  learningRecordMarkdown,
} from "@/lib/server/learning-record";
import { apiRoute } from "@/lib/server/problem";
import { requireSession } from "@/lib/server/session";

export const GET = apiRoute(async (request) => {
  const actor = await requireSession(request);
  const { db } = getServerContext();
  const record = await buildLearningRecord(db, actor.id);
  // Apply the same credential boundary to JSON and Markdown that the ZIP
  // builder already enforces. A future record field must not silently weaken
  // protection merely because the learner selected another export format.
  assertNoSecrets(record);
  const markdown = learningRecordMarkdown(record);
  assertNoSecrets(markdown);
  const format = z
    .enum(["zip", "json", "markdown"])
    .parse(new URL(request.url).searchParams.get("format") ?? "zip");
  const stamp = record.exportedAt.slice(0, 10);
  const baseName = `ielts-writing-learning-record-${stamp}`;
  if (format === "json") {
    return Response.json(record, {
      headers: {
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="${baseName}.json"`,
      },
    });
  }
  if (format === "markdown") {
    return new Response(markdown, {
      headers: {
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="${baseName}.md"`,
        "content-type": "text/markdown; charset=utf-8",
      },
    });
  }
  const archive = createLearningRecordArchive(record, markdown);
  return new Response(archive as BodyInit, {
    headers: {
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="${baseName}.zip"`,
      "content-type": "application/zip",
    },
  });
});

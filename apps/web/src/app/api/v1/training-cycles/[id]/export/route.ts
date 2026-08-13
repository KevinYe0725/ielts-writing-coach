import {
  assertNoSecrets,
  bundleMarkdown,
  createCycleBundleArchive,
} from "@iwc/exchange";
import { z } from "zod";

import { buildCycleBundle } from "@/lib/server/cycle-bundle";
import { getServerContext } from "@/lib/server/context";
import { apiRoute } from "@/lib/server/problem";
import { requireSession } from "@/lib/server/session";

export const GET = apiRoute(
  async (request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireSession(request);
    const { id } = await context.params;
    const { db } = getServerContext();
    const bundle = await buildCycleBundle(db, actor.id, id);
    assertNoSecrets(bundle);
    const markdown = bundleMarkdown(bundle);
    assertNoSecrets(markdown);
    const format = z
      .enum(["zip", "json", "markdown"])
      .parse(new URL(request.url).searchParams.get("format") ?? "zip");
    const baseName = `ielts-writing-cycle-${id}`;
    if (format === "json") {
      return Response.json(bundle, {
        headers: {
          "cache-control": "no-store",
          "content-disposition": `attachment; filename="${baseName}.json"`,
        },
      });
    }
    if (format === "markdown") {
      return new Response(markdown, {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition": `attachment; filename="${baseName}.md"`,
          "cache-control": "no-store",
        },
      });
    }
    const archive = createCycleBundleArchive(bundle);
    return new Response(archive as BodyInit, {
      headers: {
        "content-type": "application/vnd.ielts-writing-coach.bundle+zip",
        "content-disposition": `attachment; filename="${baseName}.iwc-bundle.zip"`,
        "cache-control": "no-store",
      },
    });
  },
);

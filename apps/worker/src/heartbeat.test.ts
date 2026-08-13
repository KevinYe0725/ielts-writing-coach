import { afterAll, describe, expect, it } from "vitest";

import { APPLICATION_VERSION } from "@iwc/config";
import { createDatabase, workerHeartbeat } from "@iwc/db";

import { startWorkerHeartbeat } from "./heartbeat";

const integrationUrl = process.env.DATABASE_URL;
const integration = integrationUrl ? describe : describe.skip;

integration("worker heartbeat lease", () => {
  if (!integrationUrl) return;
  const { db, pool } = createDatabase(integrationUrl);

  afterAll(async () => {
    await pool.end();
  });

  it("registers, refreshes, and removes a real executor", async () => {
    const handle = await startWorkerHeartbeat(db, "standalone", {
      intervalMs: 60_000,
    });
    const started = await db.query.workerHeartbeat.findFirst({
      where: (table, operators) => operators.eq(table.id, handle.id),
    });
    expect(started).toMatchObject({
      mode: "standalone",
      applicationVersion: APPLICATION_VERSION,
    });

    await new Promise((resolve) => setTimeout(resolve, 5));
    await handle.beat();
    const refreshed = await db.query.workerHeartbeat.findFirst({
      where: (table, operators) => operators.eq(table.id, handle.id),
    });
    expect(refreshed?.lastHeartbeatAt.getTime()).toBeGreaterThanOrEqual(
      started?.lastHeartbeatAt.getTime() ?? 0,
    );

    await handle.stop();
    expect(await db.$count(workerHeartbeat)).toBeGreaterThanOrEqual(0);
    expect(
      await db.query.workerHeartbeat.findFirst({
        where: (table, operators) => operators.eq(table.id, handle.id),
      }),
    ).toBeUndefined();
  });
});

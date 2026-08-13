import { eq, lt } from "drizzle-orm";

import { APPLICATION_VERSION } from "@iwc/config";
import { newDomainId, workerHeartbeat, type Database } from "@iwc/db";

export const WORKER_HEARTBEAT_INTERVAL_MS = 15_000;

export interface WorkerHeartbeatHandle {
  readonly id: string;
  beat(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Registers one real Graphile task executor and refreshes its lease. Readiness
 * deliberately treats a missed lease as unhealthy, so pulse failures are
 * logged but never replaced with optimistic in-process state.
 */
export async function startWorkerHeartbeat(
  db: Database,
  mode: "embedded" | "standalone",
  options: {
    readonly intervalMs?: number;
    readonly onPulseError?: (error: unknown) => void;
  } = {},
): Promise<WorkerHeartbeatHandle> {
  await db
    .delete(workerHeartbeat)
    .where(
      lt(
        workerHeartbeat.lastHeartbeatAt,
        new Date(Date.now() - 24 * 60 * 60 * 1_000),
      ),
    );
  const id = newDomainId();
  await db.insert(workerHeartbeat).values({
    id,
    mode,
    applicationVersion: APPLICATION_VERSION,
  });

  let stopped = false;
  let activePulse: Promise<void> | undefined;
  const beat = async (): Promise<void> => {
    if (stopped) return;
    activePulse ??= db
      .update(workerHeartbeat)
      .set({ lastHeartbeatAt: new Date() })
      .where(eq(workerHeartbeat.id, id))
      .then(() => undefined)
      .finally(() => {
        activePulse = undefined;
      });
    await activePulse;
  };

  const timer = setInterval(() => {
    void beat().catch((error: unknown) => options.onPulseError?.(error));
  }, options.intervalMs ?? WORKER_HEARTBEAT_INTERVAL_MS);
  timer.unref();

  return {
    id,
    beat,
    async stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      await activePulse?.catch(() => undefined);
      await db
        .delete(workerHeartbeat)
        .where(eq(workerHeartbeat.id, id))
        .catch(() => undefined);
    },
  };
}

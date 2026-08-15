import { run, type Runner, type TaskList } from "graphile-worker";

import { runAIJob } from "./tasks/ai";
import { dispatchNotifications } from "./tasks/notifications";
import {
  databaseContext,
  environment,
  recoverInterruptedJobs,
  startInterruptedJobRecovery,
} from "./runtime";
import { startWorkerHeartbeat } from "./heartbeat";

declare global {
  var __iwcEmbeddedWorker: Promise<Runner> | undefined;
}

const taskList: TaskList = {
  dispatch_notifications: dispatchNotifications,
  run_ai_job: runAIJob,
};

/**
 * Starts one process-local worker for the supported personal/single-replica
 * session-key topology. PostgreSQL remains the durable job queue.
 */
export function startEmbeddedWorker(): Promise<Runner> {
  if (environment.WORKER_MODE !== "embedded") {
    throw new Error("The embedded worker requires WORKER_MODE=embedded.");
  }
  globalThis.__iwcEmbeddedWorker ??= (async () => {
    await recoverInterruptedJobs();
    startInterruptedJobRecovery();
    const runner = await run({
      connectionString: environment.DATABASE_URL,
      concurrency: Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? 2)),
      crontab: "* * * * * dispatch_notifications ?max=1",
      noHandleSignals: true,
      taskList,
    });
    try {
      await startWorkerHeartbeat(databaseContext.db, "embedded", {
        onPulseError: () => {
          console.error("Embedded worker heartbeat update failed.");
        },
      });
    } catch (error) {
      await runner.stop();
      throw error;
    }
    return runner;
  })();
  return globalThis.__iwcEmbeddedWorker;
}

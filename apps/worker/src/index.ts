import { run, type TaskList } from "graphile-worker";

import { runAIJob } from "./tasks/ai";
import { dispatchNotifications } from "./tasks/notifications";
import {
  databaseContext,
  environment,
  recoverInterruptedJobs,
} from "./runtime";
import { startWorkerHeartbeat } from "./heartbeat";

const taskList: TaskList = {
  dispatch_notifications: dispatchNotifications,
  run_ai_job: runAIJob,
};

await recoverInterruptedJobs();

const runner = await run({
  connectionString: environment.DATABASE_URL,
  concurrency: Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? 2)),
  crontab: "* * * * * dispatch_notifications ?max=1",
  noHandleSignals: false,
  taskList,
});
const heartbeat = await startWorkerHeartbeat(databaseContext.db, "standalone", {
  onPulseError: () => {
    console.error("Worker heartbeat update failed.");
  },
}).catch(async (error: unknown) => {
  await runner.stop();
  await databaseContext.pool.end();
  throw error;
});

const close = async () => {
  await heartbeat.stop();
  await runner.stop();
  await databaseContext.pool.end();
};

process.once("SIGTERM", () => void close());
process.once("SIGINT", () => void close());

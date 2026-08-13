export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { readServerEnvironment, sessionOnlyProviderAllowed } = await import(
    "@iwc/config"
  );
  const environment = readServerEnvironment();
  if (environment.WORKER_MODE !== "embedded") return;
  if (!sessionOnlyProviderAllowed(environment)) {
    throw new Error(
      "WORKER_MODE=embedded is supported only in personal mode with WEB_REPLICAS=1.",
    );
  }

  const { startEmbeddedWorker } = await import("@iwc/worker/embedded");
  await startEmbeddedWorker();
}

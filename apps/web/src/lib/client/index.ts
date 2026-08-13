import type { LearningClient } from "./types";
import {
  HttpLearningClient,
  type HttpLearningClientOptions,
} from "./http-service";
import { mockLearningClient } from "./mock-service";

/**
 * Creates the explicit hybrid boundary used by every page. Production and
 * self-hosted builds use the real same-origin API by default. The deterministic
 * browser-only demo is opt-in so a missing backend can never be mistaken for a
 * successful save or assessment.
 */
export function createLearningClient(
  options: HttpLearningClientOptions & { demoMode?: boolean } = {},
): LearningClient {
  const { demoMode = false, ...httpOptions } = options;
  return demoMode ? mockLearningClient : new HttpLearningClient(httpOptions);
}

export const learningClient: LearningClient = createLearningClient({
  demoMode: process.env.NEXT_PUBLIC_DEMO_MODE === "true",
});

export * from "./errors";
export { HttpLearningClient } from "./http-service";
export type { HttpLearningClientOptions } from "./http-service";
export type * from "./types";

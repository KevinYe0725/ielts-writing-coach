import type {
  TeachingPracticeResponseMode,
  TeachingPracticeResponseStatus,
} from "@iwc/db";

import {
  projectTeachingPracticeAnalysis,
  type TeachingPracticeResponse,
} from "./teaching-practice-analysis";

type LinkedJobStatus =
  | "WAITING_FOR_CONSENT"
  | "QUEUED"
  | "LEASED"
  | "RUNNING"
  | "SUCCEEDED"
  | "RETRY_SCHEDULED"
  | "AI_BLOCKED"
  | "FAILED"
  | null;

export interface PublicTeachingPracticeResponse {
  readonly id: string;
  readonly promptId: string;
  readonly submittedAnswer: string;
  readonly responseMode: "CHOICE" | "SHORT_TEXT";
  readonly analysisState: TeachingPracticeResponseStatus;
  readonly analysis: TeachingPracticeResponse["analysis"];
}

export interface TeachingPracticeResponseProjectionSource {
  readonly id: string;
  readonly promptId: string;
  readonly submittedAnswer: string;
  readonly responseMode: TeachingPracticeResponseMode;
  readonly status: TeachingPracticeResponseStatus;
  readonly analysis: unknown;
}

const activeJobStates = new Set<LinkedJobStatus>([
  "QUEUED",
  "LEASED",
  "RUNNING",
  "RETRY_SCHEDULED",
]);
const unavailableJobStates = new Set<LinkedJobStatus>([
  "WAITING_FOR_CONSENT",
  "AI_BLOCKED",
  "FAILED",
]);

export function publicTeachingPracticeResponse(
  response: TeachingPracticeResponseProjectionSource,
  linkedJobStatus: LinkedJobStatus = null,
): PublicTeachingPracticeResponse {
  const analysis = projectTeachingPracticeAnalysis(
    response.analysis,
    response.submittedAnswer,
  );
  let analysisState: TeachingPracticeResponseStatus = activeJobStates.has(
    linkedJobStatus,
  )
    ? "ANALYSIS_PENDING"
    : unavailableJobStates.has(linkedJobStatus)
      ? "ANALYSIS_UNAVAILABLE"
      : response.status;
  if (
    linkedJobStatus === "SUCCEEDED" &&
    !(
      (response.status === "ANALYSIS_READY" ||
        response.status === "DEMO_ONLY") &&
      analysis
    )
  ) {
    analysisState = "ANALYSIS_UNAVAILABLE";
  }
  if (linkedJobStatus === null && response.status === "ANALYSIS_PENDING") {
    analysisState = "ANALYSIS_UNAVAILABLE";
  }
  if (
    (analysisState === "ANALYSIS_READY" || analysisState === "DEMO_ONLY") &&
    !analysis
  ) {
    analysisState = "ANALYSIS_UNAVAILABLE";
  }
  return {
    id: response.id,
    promptId: response.promptId,
    submittedAnswer: response.submittedAnswer,
    responseMode: response.responseMode,
    analysisState,
    analysis:
      analysisState === "ANALYSIS_READY" || analysisState === "DEMO_ONLY"
        ? analysis
        : null,
  };
}

export function responseHttpStatus(
  response: PublicTeachingPracticeResponse,
): 200 | 202 {
  if (response.analysisState === "ANALYSIS_PENDING") return 202;
  return 200;
}

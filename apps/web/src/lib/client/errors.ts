export interface ApiProblemDetails {
  type?: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  code: string;
  [extension: string]: unknown;
}

const retryableStatuses = new Set([408, 425, 429, 502, 503, 504]);

export class LearningClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly problem: ApiProblemDetails | undefined;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      retryable?: boolean;
      problem?: ApiProblemDetails;
      cause?: unknown;
      details?: Record<string, unknown>;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "LearningClientError";
    this.status = options.status ?? 0;
    this.code = options.code ?? "CLIENT_ERROR";
    this.retryable =
      options.retryable ?? retryableStatuses.has(options.status ?? 0);
    this.problem = options.problem;
    this.details = options.details;
  }
}

export interface DraftConflictSide {
  revision?: number;
  base_revision?: number;
  content: string;
  word_count?: number;
  conflict_id?: string;
}

export class DraftConflictError extends LearningClientError {
  readonly serverDraft: DraftConflictSide;
  readonly clientDraft: DraftConflictSide;

  constructor(
    problem: ApiProblemDetails,
    serverDraft: DraftConflictSide,
    clientDraft: DraftConflictSide,
  ) {
    super(problem.detail, {
      status: problem.status,
      code: problem.code,
      retryable: false,
      problem,
    });
    this.name = "DraftConflictError";
    this.serverDraft = serverDraft;
    this.clientDraft = clientDraft;
  }
}

export function isApiProblem(value: unknown): value is ApiProblemDetails {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ApiProblemDetails>;
  return (
    typeof candidate.title === "string" &&
    typeof candidate.status === "number" &&
    typeof candidate.detail === "string" &&
    typeof candidate.code === "string"
  );
}

function isConflictSide(value: unknown): value is DraftConflictSide {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as Partial<DraftConflictSide>).content === "string"
  );
}

export function errorFromProblem(
  problem: ApiProblemDetails,
): LearningClientError {
  if (
    problem.status === 409 &&
    problem.code === "DRAFT_REVISION_CONFLICT" &&
    isConflictSide(problem.server) &&
    isConflictSide(problem.client)
  ) {
    return new DraftConflictError(problem, problem.server, problem.client);
  }
  return new LearningClientError(problem.detail, {
    status: problem.status,
    code: problem.code,
    problem,
  });
}

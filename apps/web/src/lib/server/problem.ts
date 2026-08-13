import { ZodError } from "zod";

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  code: string;
  errors?: Array<{ path: string; message: string }>;
}

export type ProblemExtensions = Record<string, unknown>;
export type ProblemInput = Omit<ProblemDetails, "type"> & {
  type?: string;
} & ProblemExtensions;

export class ApiProblem extends Error {
  readonly problem: ProblemDetails;

  constructor(problem: ProblemInput) {
    super(problem.detail);
    this.problem = {
      type:
        problem.type ??
        `https://ielts-writing-coach.dev/problems/${problem.code.toLowerCase()}`,
      ...problem,
    } as ProblemDetails;
  }
}

export function problemResponse(problem: ProblemDetails): Response {
  return Response.json(problem, {
    status: problem.status,
    headers: {
      "content-type": "application/problem+json",
      "cache-control": "no-store",
    },
  });
}

/** Force sensitive endpoints such as authentication to bypass every cache. */
export function forceNoStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  // Fetch-originated and redirect responses can carry an immutable Headers
  // guard. Re-wrap instead of mutating so auth redirects and Set-Cookie values
  // are preserved while the cache policy is always enforceable.
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function handleApiError(error: unknown, request: Request): Response {
  if (error instanceof ApiProblem) {
    return problemResponse({
      ...error.problem,
      instance: new URL(request.url).pathname,
    });
  }
  if (error instanceof ZodError) {
    return problemResponse({
      type: "https://ielts-writing-coach.dev/problems/validation",
      title: "Invalid request",
      status: 422,
      code: "VALIDATION_ERROR",
      detail: "One or more request fields are invalid.",
      instance: new URL(request.url).pathname,
      errors: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  const coded = error as { code?: string; message?: string };
  if (coded.code === "INVALID_ORIGIN") {
    return problemResponse({
      type: "https://ielts-writing-coach.dev/problems/invalid-origin",
      title: "Invalid origin",
      status: 403,
      code: "INVALID_ORIGIN",
      detail: "The request origin is not trusted.",
      instance: new URL(request.url).pathname,
    });
  }

  return problemResponse({
    type: "https://ielts-writing-coach.dev/problems/internal",
    title: "Internal server error",
    status: 500,
    code: "INTERNAL_ERROR",
    detail:
      "The request could not be completed. Sensitive details were not exposed.",
    instance: new URL(request.url).pathname,
  });
}

export function apiRoute<T extends unknown[]>(
  handler: (request: Request, ...arguments_: T) => Promise<Response>,
): (request: Request, ...arguments_: T) => Promise<Response> {
  return async (request, ...arguments_) => {
    try {
      const response = await handler(request, ...arguments_);
      if (!response.headers.has("cache-control")) {
        response.headers.set("cache-control", "no-store");
      }
      return response;
    } catch (error) {
      return handleApiError(error, request);
    }
  };
}

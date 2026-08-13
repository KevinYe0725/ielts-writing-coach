export class OriginValidationError extends Error {
  readonly code = "INVALID_ORIGIN";
  constructor() {
    super("The request origin is not trusted.");
  }
}

export function assertTrustedOrigin(
  request: Request,
  trustedOrigins: readonly string[],
): void {
  const method = request.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return;
  const origin = request.headers.get("origin");
  if (!origin) throw new OriginValidationError();

  let canonical: string;
  try {
    const parsed = new URL(origin);
    if (!/^https?:$/u.test(parsed.protocol)) throw new OriginValidationError();
    canonical = parsed.origin;
  } catch {
    throw new OriginValidationError();
  }
  const trusted = trustedOrigins.some((value) => {
    try {
      return new URL(value).origin === canonical;
    } catch {
      return false;
    }
  });
  if (!trusted) throw new OriginValidationError();
}

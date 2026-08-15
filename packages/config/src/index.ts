import { z } from "zod";
import { readFileSync } from "node:fs";

export { APPLICATION_VERSION } from "./version";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(
  emptyToUndefined,
  z.string().min(1).optional(),
);
const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional());
const optionalPort = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().min(1).max(65_535).optional(),
);
const optionalBoolean = z.preprocess((value) => {
  if (value === "true") return true;
  if (value === "false" || value === "") return false;
  return value;
}, z.boolean().optional());

const serverEnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z
    .url({ protocol: /^postgres(?:ql)?$/ })
    .default("postgresql://iwc:iwc@127.0.0.1:5432/iwc"),
  APP_URL: z.url().default("http://127.0.0.1:3000"),
  DEPLOYMENT_MODE: z.enum(["personal", "shared"]).default("personal"),
  AUTH_SECRET: optionalString,
  AUTH_SECRET_FILE: optionalString,
  APP_ENCRYPTION_KEY: optionalString,
  APP_ENCRYPTION_KEY_FILE: optionalString,
  APP_ENCRYPTION_KEY_VERSION: z.coerce.number().int().positive().default(1),
  SETUP_TOKEN: optionalString,
  SETUP_TOKEN_FILE: optionalString,
  WORKER_MODE: z.enum(["embedded", "standalone"]).default("standalone"),
  WEB_REPLICAS: z.coerce.number().int().positive().default(1),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  SMTP_HOST: optionalString,
  SMTP_PORT: optionalPort.default(587),
  SMTP_SECURE: optionalBoolean.default(false),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  SMTP_FROM: optionalString,
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: optionalString,
  LOCAL_MODEL_BASE_URL_ALLOWLIST: optionalString,
  TRUSTED_ORIGINS: optionalString,
  TELEMETRY_ENABLED: optionalBoolean.default(false),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function readServerEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): ServerEnvironment {
  const merged = { ...environment };
  for (const [valueKey, fileKey] of [
    ["AUTH_SECRET", "AUTH_SECRET_FILE"],
    ["APP_ENCRYPTION_KEY", "APP_ENCRYPTION_KEY_FILE"],
    ["SETUP_TOKEN", "SETUP_TOKEN_FILE"],
  ] as const) {
    const file = merged[fileKey];
    if (!merged[valueKey] && file)
      merged[valueKey] = readFileSync(file, "utf8").trim();
  }
  return serverEnvironmentSchema.parse(merged);
}

export interface ConfigurationReadiness {
  ready: boolean;
  missing: string[];
  warnings: string[];
}

export function inspectConfigurationReadiness(
  environment: ServerEnvironment,
): ConfigurationReadiness {
  const missing: string[] = [];
  const warnings: string[] = [];

  if (!environment.AUTH_SECRET || environment.AUTH_SECRET.length < 32) {
    missing.push("AUTH_SECRET");
  }
  if (!environment.APP_ENCRYPTION_KEY) {
    missing.push("APP_ENCRYPTION_KEY");
  } else {
    const encoded = environment.APP_ENCRYPTION_KEY.trim();
    const keyBytes = /^[a-f\d]{64}$/i.test(encoded)
      ? Buffer.from(encoded, "hex")
      : Buffer.from(encoded, "base64");
    if (keyBytes.byteLength !== 32) {
      missing.push("APP_ENCRYPTION_KEY (must decode to exactly 32 bytes)");
    }
  }
  if (!environment.SETUP_TOKEN) {
    warnings.push("SETUP_TOKEN is absent; first-owner setup is disabled.");
  }
  if (environment.TELEMETRY_ENABLED) {
    warnings.push(
      "Telemetry is enabled explicitly; the project default is off.",
    );
  }
  if (
    environment.WORKER_MODE === "embedded" &&
    !sessionOnlyProviderAllowed(environment)
  ) {
    missing.push(
      "WORKER_MODE=embedded requires DEPLOYMENT_MODE=personal and WEB_REPLICAS=1",
    );
  }
  if (Boolean(environment.SMTP_HOST) !== Boolean(environment.SMTP_FROM)) {
    warnings.push(
      "SMTP_HOST and SMTP_FROM must be configured together; email is disabled.",
    );
  }
  if (Boolean(environment.SMTP_USER) !== Boolean(environment.SMTP_PASSWORD)) {
    warnings.push(
      "SMTP_USER and SMTP_PASSWORD must be configured together; email is disabled.",
    );
  }
  if (
    environment.NODE_ENV === "production" &&
    !["localhost", "127.0.0.1", "::1"].includes(
      new URL(environment.APP_URL).hostname,
    ) &&
    new URL(environment.APP_URL).protocol !== "https:"
  ) {
    missing.push("APP_URL must use HTTPS outside localhost in production");
  }
  if (
    environment.NODE_ENV === "production" &&
    !["localhost", "127.0.0.1", "::1"].includes(
      new URL(environment.APP_URL).hostname,
    ) &&
    environment.TRUST_PROXY_HOPS === 0
  ) {
    missing.push(
      "TRUST_PROXY_HOPS must identify the sanitized HTTPS ingress chain in public deployments",
    );
  }

  return { ready: missing.length === 0, missing, warnings };
}

export function sessionOnlyProviderAllowed(
  environment: ServerEnvironment,
): boolean {
  return (
    environment.DEPLOYMENT_MODE === "personal" &&
    environment.WORKER_MODE === "embedded" &&
    environment.WEB_REPLICAS === 1
  );
}

export function localModelAllowlist(environment: ServerEnvironment): string[] {
  return (environment.LOCAL_MODEL_BASE_URL_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Additional exact origins (beyond APP_URL) whose browsers may call this
 * instance. Comma-separated, e.g. "http://localhost:3000,https://coach.example".
 * Each entry must be a full http(s) origin; entries that do not parse are
 * ignored rather than silently broadening trust.
 */
export function trustedOrigins(environment: ServerEnvironment): string[] {
  const seen = new Set<string>();
  const origins: string[] = [];
  for (const entry of (environment.TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)) {
    try {
      const parsed = new URL(entry);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
      const canonical = parsed.origin;
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      origins.push(canonical);
    } catch {
      continue;
    }
  }
  return origins;
}

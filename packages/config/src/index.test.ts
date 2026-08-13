import { describe, expect, it } from "vitest";

import {
  inspectConfigurationReadiness,
  readServerEnvironment,
  sessionOnlyProviderAllowed,
} from "./index";

describe("server environment", () => {
  it("keeps the project private-by-default", () => {
    const environment = readServerEnvironment({ NODE_ENV: "test" });
    expect(environment.DEPLOYMENT_MODE).toBe("personal");
    expect(environment.TELEMETRY_ENABLED).toBe(false);
    expect(inspectConfigurationReadiness(environment).ready).toBe(false);
  });

  it("only permits session-only keys in a single embedded personal instance", () => {
    const allowed = readServerEnvironment({
      DEPLOYMENT_MODE: "personal",
      WORKER_MODE: "embedded",
      WEB_REPLICAS: "1",
    });
    const shared = readServerEnvironment({
      DEPLOYMENT_MODE: "shared",
      WORKER_MODE: "embedded",
      WEB_REPLICAS: "1",
    });

    expect(sessionOnlyProviderAllowed(allowed)).toBe(true);
    expect(sessionOnlyProviderAllowed(shared)).toBe(false);
    expect(inspectConfigurationReadiness(shared).ready).toBe(false);
  });

  it("reports partial SMTP configuration instead of silently claiming email support", () => {
    const readiness = inspectConfigurationReadiness(
      readServerEnvironment({
        SMTP_HOST: "smtp.example.test",
        SMTP_USER: "coach",
      }),
    );
    expect(readiness.warnings).toContain(
      "SMTP_HOST and SMTP_FROM must be configured together; email is disabled.",
    );
    expect(readiness.warnings).toContain(
      "SMTP_USER and SMTP_PASSWORD must be configured together; email is disabled.",
    );
  });

  it("rejects malformed encryption material before a provider key is saved", () => {
    const malformed = inspectConfigurationReadiness(
      readServerEnvironment({
        AUTH_SECRET: "a".repeat(32),
        APP_ENCRYPTION_KEY: "platform-generated-but-wrong-length",
      }),
    );
    expect(malformed.ready).toBe(false);
    expect(malformed.missing).toContain(
      "APP_ENCRYPTION_KEY (must decode to exactly 32 bytes)",
    );

    const valid = inspectConfigurationReadiness(
      readServerEnvironment({
        AUTH_SECRET: "a".repeat(32),
        APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      }),
    );
    expect(valid.missing).not.toContain(
      "APP_ENCRYPTION_KEY (must decode to exactly 32 bytes)",
    );
  });

  it("requires HTTPS for a non-local production origin", () => {
    const readiness = inspectConfigurationReadiness(
      readServerEnvironment({
        NODE_ENV: "production",
        APP_URL: "http://coach.example.test",
        AUTH_SECRET: "a".repeat(32),
        APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      }),
    );
    expect(readiness.missing).toContain(
      "APP_URL must use HTTPS outside localhost in production",
    );
    expect(readiness.missing).toContain(
      "TRUST_PROXY_HOPS must identify the sanitized HTTPS ingress chain in public deployments",
    );
  });

  it("requires an explicit sanitized proxy chain for public production", () => {
    const readiness = inspectConfigurationReadiness(
      readServerEnvironment({
        NODE_ENV: "production",
        APP_URL: "https://coach.example.test",
        AUTH_SECRET: "a".repeat(32),
        APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
        TRUST_PROXY_HOPS: "1",
      }),
    );
    expect(readiness.ready).toBe(true);
  });
});

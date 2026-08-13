import { describe, expect, it } from "vitest";

import { isAuthorized } from "./authorization";
import { assertTrustedOrigin, OriginValidationError } from "./origin";
import { digestOpaqueToken, tokenMatchesDigest } from "./tokens";

describe("authorization", () => {
  it("does not let administrators read learner essays by default", () => {
    expect(
      isAuthorized("learning:read-learner-content", {
        actorId: "admin",
        actorRole: "admin",
        resourceOwnerId: "learner",
      }),
    ).toBe(false);
  });

  it("allows explicit self-hosted instance opt-in", () => {
    expect(
      isAuthorized("learning:read-learner-content", {
        actorId: "owner",
        actorRole: "owner",
        resourceOwnerId: "learner",
        adminContentAccessEnabled: true,
      }),
    ).toBe(true);
  });

  it("compares one-time token digests", () => {
    const digest = digestOpaqueToken("temporary-token");
    expect(tokenMatchesDigest("temporary-token", digest)).toBe(true);
    expect(tokenMatchesDigest("replayed-token", digest)).toBe(false);
  });

  it("rejects missing, opaque, malformed, and non-HTTP mutation origins", () => {
    for (const origin of [undefined, "null", "not a URL", "file:///tmp/x"]) {
      const headers = origin === undefined ? {} : { origin };
      expect(() =>
        assertTrustedOrigin(
          new Request("https://coach.test/api/v1/preferences", {
            method: "PUT",
            headers,
          }),
          ["https://coach.test"],
        ),
      ).toThrow(OriginValidationError);
    }
  });

  it("accepts the configured HTTP origin and rejects a sibling origin", () => {
    expect(() =>
      assertTrustedOrigin(
        new Request("https://coach.test/api/v1/preferences", {
          method: "PUT",
          headers: { origin: "https://coach.test" },
        }),
        ["https://coach.test"],
      ),
    ).not.toThrow();
    expect(() =>
      assertTrustedOrigin(
        new Request("https://coach.test/api/v1/preferences", {
          method: "PUT",
          headers: { origin: "https://evil.coach.test" },
        }),
        ["https://coach.test"],
      ),
    ).toThrow(OriginValidationError);
  });
});

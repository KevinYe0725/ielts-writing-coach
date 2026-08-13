import { describe, expect, it } from "vitest";

import { apiRoute, forceNoStore } from "./problem";

describe("sensitive API response boundaries", () => {
  it("forces an authentication-style response to no-store", async () => {
    const route = apiRoute(async () =>
      forceNoStore(
        Response.json(
          { session: { user_id: "private-user" } },
          { headers: { "cache-control": "public, max-age=3600" } },
        ),
      ),
    );
    const response = await route(
      new Request("https://coach.test/api/v1/auth/get-session"),
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("adds no-store to immutable redirects without dropping cookies", () => {
    const redirect = Response.redirect("https://coach.test/signin", 302);
    const protectedRedirect = forceNoStore(redirect);
    expect(protectedRedirect.status).toBe(302);
    expect(protectedRedirect.headers.get("cache-control")).toBe("no-store");

    const withCookie = new Response(redirect.body, {
      status: redirect.status,
      headers: [
        ...redirect.headers.entries(),
        ["set-cookie", "iwc.session=opaque; HttpOnly; Secure"] as const,
      ],
    });
    const protectedResponse = forceNoStore(withCookie);
    expect(protectedResponse.status).toBe(302);
    expect(protectedResponse.headers.get("location")).toBe(
      "https://coach.test/signin",
    );
    expect(protectedResponse.headers.getSetCookie()).toEqual([
      "iwc.session=opaque; HttpOnly; Secure",
    ]);
    expect(protectedResponse.headers.get("cache-control")).toBe("no-store");
  });

  it("maps an invalid mutation origin to a non-cacheable 403 problem", async () => {
    const route = apiRoute(async () => {
      const error = new Error("untrusted") as Error & { code: string };
      error.code = "INVALID_ORIGIN";
      throw error;
    });
    const response = await route(
      new Request("https://coach.test/api/v1/auth/sign-in/email", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_ORIGIN",
    });
  });
});

import { describe, expect, it, vi } from "vitest";

import { consumeOneTimeLinkFromAddressBar } from "./one-time-link";

describe("one-time link browser boundary", () => {
  it("keeps the token only in the return value and clears the full query", () => {
    const replaceState = vi.fn();
    const result = consumeOneTimeLinkFromAddressBar(
      {
        href: "https://coach.test/join?token=opaque-once&campaign=private#form",
        pathname: "/join",
        hash: "#form",
      } as Location,
      { state: { preserved: true }, replaceState } as unknown as History,
    );

    expect(result).toEqual({ token: "opaque-once", invalidToken: false });
    expect(replaceState).toHaveBeenCalledWith(
      { preserved: true },
      "",
      "/join#form",
    );
    expect(JSON.stringify(replaceState.mock.calls)).not.toContain(
      "opaque-once",
    );
  });

  it("preserves invalid-token state in memory while stripping the URL", () => {
    const replaceState = vi.fn();
    expect(
      consumeOneTimeLinkFromAddressBar(
        {
          href: "https://coach.test/recover?error=INVALID_TOKEN",
          pathname: "/recover",
          hash: "",
        } as Location,
        { state: null, replaceState } as unknown as History,
      ),
    ).toEqual({ token: "", invalidToken: true });
    expect(replaceState).toHaveBeenCalledWith(null, "", "/recover");
  });
});

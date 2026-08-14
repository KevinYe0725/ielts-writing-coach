import { describe, expect, it, vi } from "vitest";

import {
  enterAccount,
  parseAccountReturnPath,
  type AccountEntryDependencies,
} from "./account-entry";

const credentials = {
  email: "learner@example.com",
  password: "a-secure-password",
  returnPath: "/write?cycle=cycle-demo",
  origin: "https://coach.test",
};

function dependencies(
  overrides: Partial<AccountEntryDependencies> = {},
): AccountEntryDependencies {
  return {
    findUserByEmail: vi.fn().mockResolvedValue(null),
    getDeploymentMode: vi.fn().mockResolvedValue("personal"),
    signIn: vi.fn().mockResolvedValue({ headers: new Headers() }),
    signUp: vi.fn().mockResolvedValue({ headers: new Headers() }),
    ...overrides,
  };
}

describe("account entry", () => {
  it("creates an unknown email only in a personal deployment", async () => {
    const input = dependencies();

    await expect(enterAccount(credentials, input)).resolves.toEqual({
      kind: "REGISTERED",
      redirectTo: "/write?cycle=cycle-demo",
      headers: new Headers(),
    });
    expect(input.signIn).toHaveBeenCalledTimes(1);
    expect(input.signUp).toHaveBeenCalledWith({
      email: "learner@example.com",
      name: "learner",
      password: "a-secure-password",
      origin: "https://coach.test",
    });
  });

  it("does not create an account when the email already exists and sign-in fails", async () => {
    const input = dependencies({
      findUserByEmail: vi.fn().mockResolvedValue({ id: "existing" }),
      signIn: vi.fn().mockRejectedValue(new Error("wrong password")),
    });

    await expect(enterAccount(credentials, input)).resolves.toEqual({
      kind: "INVALID_CREDENTIALS",
    });
    expect(input.signUp).not.toHaveBeenCalled();
  });

  it("requires an invitation for an unknown shared-deployment email", async () => {
    const input = dependencies({
      getDeploymentMode: vi.fn().mockResolvedValue("shared"),
    });

    await expect(enterAccount(credentials, input)).resolves.toEqual({
      kind: "INVITE_REQUIRED",
    });
    expect(input.signIn).not.toHaveBeenCalled();
    expect(input.signUp).not.toHaveBeenCalled();
  });

  it("falls back to sign-in when another request created the email first", async () => {
    const headers = new Headers({ "set-cookie": "iwc.session=raced" });
    const input = dependencies({
      signUp: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("email already exists"), { status: 409 }),
        ),
      signIn: vi.fn().mockResolvedValue({ headers }),
    });

    await expect(enterAccount(credentials, input)).resolves.toEqual({
      kind: "SIGNED_IN",
      redirectTo: "/write?cycle=cycle-demo",
      headers,
    });
    expect(input.signIn).toHaveBeenCalledOnce();
  });

  it.each([
    [null, "/today"],
    ["/lesson?cycle=cycle-demo", "/lesson?cycle=cycle-demo"],
    ["//evil.example", "/today"],
    ["https://evil.example", "/today"],
    ["javascript:alert(1)", "/today"],
  ])("maps %s to safe return path %s", (value, expected) => {
    expect(parseAccountReturnPath(value)).toBe(expected);
  });
});

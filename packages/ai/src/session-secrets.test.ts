import { afterEach, describe, expect, it } from "vitest";

import {
  deleteSessionProviderSecret,
  getSessionProviderSecret,
  setSessionProviderSecret,
} from "./session-secrets";

const connectionId = "019ff7a0-0000-7000-8000-000000000001";

describe("process-local provider secrets", () => {
  afterEach(() => deleteSessionProviderSecret(connectionId));

  it("is shared inside one process and can be explicitly revoked", () => {
    setSessionProviderSecret(connectionId, "temporary-test-value");
    expect(getSessionProviderSecret(connectionId)).toBe("temporary-test-value");
    deleteSessionProviderSecret(connectionId);
    expect(getSessionProviderSecret(connectionId)).toBeUndefined();
  });
});

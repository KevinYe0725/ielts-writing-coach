import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, newDomainId, providerConnection, user } from "@iwc/db";

import {
  adapterForConnection,
  providerConnectionAuthorizedForActor,
} from "./providers";

describe("Web provider connection ownership policy", () => {
  it("does not expose personal connections across actors", () => {
    expect(
      providerConnectionAuthorizedForActor({
        actorId: "learner-a",
        connectionOwnerId: "owner-a",
        connectionOwnerRole: "owner",
        deploymentMode: "personal",
      }),
    ).toBe(false);
    expect(
      providerConnectionAuthorizedForActor({
        actorId: "learner-a",
        connectionOwnerId: "owner-a",
        connectionOwnerRole: "owner",
        deploymentMode: "shared",
      }),
    ).toBe(true);
    expect(
      providerConnectionAuthorizedForActor({
        actorId: "learner-a",
        connectionOwnerId: "learner-b",
        connectionOwnerRole: "learner",
        deploymentMode: "shared",
      }),
    ).toBe(false);
  });
});

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("Web shared provider adapter integration", () => {
  const database = createDatabase(process.env.DATABASE_URL!);
  const suffix = newDomainId();
  const ownerId = `web-provider-owner-${suffix}`;
  const learnerId = `web-provider-learner-${suffix}`;
  const providerId = newDomainId();

  beforeAll(async () => {
    await database.db.insert(user).values([
      {
        id: ownerId,
        name: "Web provider owner",
        email: `${ownerId}@example.test`,
        role: "owner",
      },
      {
        id: learnerId,
        name: "Web provider learner",
        email: `${learnerId}@example.test`,
        role: "learner",
      },
    ]);
    await database.db.insert(providerConnection).values({
      id: providerId,
      ownerId,
      name: "Web shared mock provider",
      kind: "mock",
      secretMode: "encrypted",
    });
  });

  afterAll(async () => {
    await database.db.delete(user).where(eq(user.id, ownerId));
    await database.db.delete(user).where(eq(user.id, learnerId));
    await database.pool.end();
  });

  it("opens the actual frozen Owner connection for a shared Learner", async () => {
    await expect(
      adapterForConnection(learnerId, providerId, "shared"),
    ).resolves.toMatchObject({ kind: "mock" });
    await expect(
      adapterForConnection(learnerId, providerId, "personal"),
    ).rejects.toMatchObject({
      problem: { code: "PROVIDER_NOT_FOUND", status: 404 },
    });
  });
});

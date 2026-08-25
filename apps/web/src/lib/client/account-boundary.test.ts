import { afterEach, describe, expect, it, vi } from "vitest";

import * as accountBoundary from "./account-boundary";

interface BoundaryMessage {
  kind: string;
  version: number;
}

class FakeBroadcastChannel {
  static readonly channels = new Set<FakeBroadcastChannel>();
  readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();
  readonly posted: unknown[] = [];

  constructor(readonly name: string) {
    FakeBroadcastChannel.channels.add(this);
  }

  addEventListener(
    type: string,
    listener: (event: MessageEvent<unknown>) => void,
  ): void {
    if (type === "message") this.listeners.add(listener);
  }

  close(): void {
    FakeBroadcastChannel.channels.delete(this);
  }

  postMessage(message: unknown): void {
    this.posted.push(message);
    for (const channel of FakeBroadcastChannel.channels) {
      if (channel === this || channel.name !== this.name) continue;
      for (const listener of channel.listeners)
        listener({ data: message } as MessageEvent<unknown>);
    }
  }

  removeEventListener(
    type: string,
    listener: (event: MessageEvent<unknown>) => void,
  ): void {
    if (type === "message") this.listeners.delete(listener);
  }
}

function boundaryApi() {
  return accountBoundary as typeof accountBoundary & {
    ACCOUNT_BOUNDARY_CHANNEL_NAME?: string;
    disposeAccountBoundaryChannel?: () => void;
    markAccountBoundaryAfterSuccessfulResponse?: (response: Response) => void;
  };
}

describe("cross-document account boundary", () => {
  afterEach(() => {
    boundaryApi().disposeAccountBoundaryChannel?.();
    FakeBroadcastChannel.channels.clear();
    vi.unstubAllGlobals();
  });

  it("advances immediately after an ok response even when its body is malformed", async () => {
    const markSuccessful =
      boundaryApi().markAccountBoundaryAfterSuccessfulResponse;
    expect(markSuccessful).toBeTypeOf("function");
    const before = accountBoundary.currentAccountBoundary();
    const malformed = new Response('{"redirect_to":', {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    markSuccessful!(malformed);

    const after = accountBoundary.currentAccountBoundary();
    expect(after.generation).toBe(before.generation + 1);
    expect(before.signal.aborted).toBe(true);
    await expect(malformed.json()).rejects.toBeInstanceOf(SyntaxError);
  });

  it("does not advance for a non-ok sign-in response", () => {
    const markSuccessful =
      boundaryApi().markAccountBoundaryAfterSuccessfulResponse;
    expect(markSuccessful).toBeTypeOf("function");
    const before = accountBoundary.currentAccountBoundary();

    markSuccessful!(new Response("unauthorized", { status: 401 }));

    expect(accountBoundary.currentAccountBoundary().generation).toBe(
      before.generation,
    );
    expect(before.signal.aborted).toBe(false);
  });

  it("broadcasts one fixed identity-free message and advances remote state without a loop", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const api = boundaryApi();
    expect(api.ACCOUNT_BOUNDARY_CHANNEL_NAME).toBeTypeOf("string");
    expect(api.disposeAccountBoundaryChannel).toBeTypeOf("function");
    api.disposeAccountBoundaryChannel!();
    const before = accountBoundary.currentAccountBoundary();
    const remote = new FakeBroadcastChannel(api.ACCOUNT_BOUNDARY_CHANNEL_NAME!);

    accountBoundary.markAccountBoundary();

    expect(remote.posted).toEqual([]);
    const localChannel = [...FakeBroadcastChannel.channels].find(
      (channel) => channel !== remote,
    );
    expect(localChannel?.posted).toHaveLength(1);
    const message = localChannel?.posted[0] as BoundaryMessage;
    expect(message).toEqual({ kind: "ACCOUNT_BOUNDARY", version: 1 });
    expect(JSON.stringify(message)).not.toMatch(
      /account@|email|identity|token|user[_-]?id/iu,
    );
    expect(accountBoundary.currentAccountBoundary().generation).toBe(
      before.generation + 1,
    );

    const remoteBefore = accountBoundary.currentAccountBoundary();
    remote.postMessage({ kind: "ACCOUNT_BOUNDARY", version: 1 });
    const remoteAfter = accountBoundary.currentAccountBoundary();
    expect(remoteAfter.generation).toBe(remoteBefore.generation + 1);
    expect(remoteBefore.signal.aborted).toBe(true);
    expect(localChannel?.posted).toHaveLength(1);
  });
});

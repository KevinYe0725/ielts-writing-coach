export interface AccountBoundarySnapshot {
  generation: number;
  signal: AbortSignal;
}

export const ACCOUNT_BOUNDARY_CHANNEL_NAME = "iwc:account-boundary:v1";

const ACCOUNT_BOUNDARY_MESSAGE = Object.freeze({
  kind: "ACCOUNT_BOUNDARY",
  version: 1,
});

let generation = 0;
let controller = new AbortController();
let channel: BroadcastChannel | null | undefined;

function isAccountBoundaryMessage(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    record.kind === ACCOUNT_BOUNDARY_MESSAGE.kind &&
    record.version === ACCOUNT_BOUNDARY_MESSAGE.version
  );
}

function advanceAccountBoundary(): void {
  const previous = controller;
  generation += 1;
  controller = new AbortController();
  previous.abort(
    new DOMException("The account context changed.", "AbortError"),
  );
}

function receiveAccountBoundary(event: MessageEvent<unknown>): void {
  if (isAccountBoundaryMessage(event.data)) advanceAccountBoundary();
}

function ensureAccountBoundaryChannel(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  channel = null;
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined")
    return channel;
  const created = new BroadcastChannel(ACCOUNT_BOUNDARY_CHANNEL_NAME);
  created.addEventListener("message", receiveAccountBoundary);
  channel = created;
  return channel;
}

/** Marks a confirmed or imminent account transition for every live client. */
export function markAccountBoundary(): void {
  const activeChannel = ensureAccountBoundaryChannel();
  advanceAccountBoundary();
  activeChannel?.postMessage(ACCOUNT_BOUNDARY_MESSAGE);
}

export function markAccountBoundaryAfterSuccessfulResponse(
  response: Response,
): void {
  if (response.ok) markAccountBoundary();
}

export function disposeAccountBoundaryChannel(): void {
  if (channel) {
    channel.removeEventListener("message", receiveAccountBoundary);
    channel.close();
  }
  channel = undefined;
}

/** Process-local generation and signal; neither contains an account identity. */
export function currentAccountBoundary(): AccountBoundarySnapshot {
  ensureAccountBoundaryChannel();
  return { generation, signal: controller.signal };
}

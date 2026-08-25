export interface AccountBoundarySnapshot {
  generation: number;
  signal: AbortSignal;
}

let generation = 0;
let controller = new AbortController();

/** Marks a confirmed or imminent account transition for every live client. */
export function markAccountBoundary(): void {
  const previous = controller;
  generation += 1;
  controller = new AbortController();
  previous.abort(
    new DOMException("The account context changed.", "AbortError"),
  );
}

/** Process-local generation and signal; neither contains an account identity. */
export function currentAccountBoundary(): AccountBoundarySnapshot {
  return { generation, signal: controller.signal };
}

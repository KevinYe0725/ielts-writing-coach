let accountBoundary = {};

/** Marks a confirmed or imminent account transition for every live client. */
export function markAccountBoundary(): void {
  accountBoundary = {};
}

/** Opaque process-local token; it never contains an account identifier. */
export function currentAccountBoundary(): object {
  return accountBoundary;
}

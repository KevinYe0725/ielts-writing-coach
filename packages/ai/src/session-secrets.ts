declare global {
  var __iwcSessionProviderSecrets: Map<string, string> | undefined;
}

function sessionSecretStore(): Map<string, string> {
  globalThis.__iwcSessionProviderSecrets ??= new Map();
  return globalThis.__iwcSessionProviderSecrets;
}

/** Process-local storage used only by the single-replica embedded executor. */
export function setSessionProviderSecret(
  connectionId: string,
  secret: string,
): void {
  sessionSecretStore().set(connectionId, secret);
}

export function getSessionProviderSecret(
  connectionId: string,
): string | undefined {
  return sessionSecretStore().get(connectionId);
}

export function deleteSessionProviderSecret(connectionId: string): void {
  sessionSecretStore().delete(connectionId);
}

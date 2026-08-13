/**
 * Small IndexedDB journal for drafts that have not been acknowledged by the
 * server yet. It deliberately stores no credentials, prompts, or feedback.
 */
export interface CachedWritingDraft {
  attemptId: string;
  content: string;
  serverRevision?: number;
  updatedAt: string;
  syncState: "pending" | "synced";
}

const DATABASE_NAME = "ielts-writing-coach";
const DATABASE_VERSION = 1;
const STORE_NAME = "writing-drafts";

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "attemptId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  const database = await openDatabase();
  if (!database) return undefined;
  try {
    return await new Promise<T | undefined>((resolve) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
      transaction.onabort = () => resolve(undefined);
    });
  } finally {
    database.close();
  }
}

export async function readCachedWritingDraft(
  attemptId: string,
): Promise<CachedWritingDraft | null> {
  const value = await withStore<CachedWritingDraft>("readonly", (store) =>
    store.get(attemptId),
  );
  return value ?? null;
}

export async function cacheWritingDraft(
  draft: CachedWritingDraft,
): Promise<void> {
  await withStore<IDBValidKey>("readwrite", (store) => store.put(draft));
}

export async function removeCachedWritingDraft(
  attemptId: string,
): Promise<void> {
  await withStore<undefined>("readwrite", (store) => store.delete(attemptId));
}

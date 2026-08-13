export interface CachedLessonItem {
  lessonId: string;
  itemId: string;
  answer: string;
  firstAnswer: string;
  responseId?: string;
  attempts: number;
  hintLevel: number;
  revealed: boolean;
  updatedAt: string;
}

const DATABASE_NAME = "ielts-writing-coach-lessons";
const STORE_NAME = "lesson-items";

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME))
        database.createObjectStore(STORE_NAME, {
          keyPath: ["lessonId", "itemId"],
        });
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

export async function readCachedLessonItem(
  lessonId: string,
  itemId: string,
): Promise<CachedLessonItem | null> {
  const value = await withStore<CachedLessonItem>("readonly", (store) =>
    store.get([lessonId, itemId]),
  );
  return value ?? null;
}

export async function cacheLessonItem(value: CachedLessonItem): Promise<void> {
  await withStore<IDBValidKey>("readwrite", (store) => store.put(value));
}

export async function removeCachedLessonItem(
  lessonId: string,
  itemId: string,
): Promise<void> {
  await withStore<undefined>("readwrite", (store) =>
    store.delete([lessonId, itemId]),
  );
}

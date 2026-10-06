// IndexedDB stores only unsynced work, never a clean historical account clone.
export interface GymJournal {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
export const browserGymJournal: GymJournal = {
  get: (key) => transaction('readonly', (store) => store.get(key)),
  put: (key, value) =>
    transaction('readwrite', (store) => store.put(value, key)).then(
      () => undefined,
    ),
  remove: (key) =>
    transaction('readwrite', (store) => store.delete(key)).then(
      () => undefined,
    ),
};
async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open('stillform-gym-pending', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('journal');
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('journal', mode);
      const request = run(tx.objectStore('journal'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () =>
        reject(tx.error ?? new Error('Pending Gym storage failed'));
    });
  } finally {
    db.close();
  }
}

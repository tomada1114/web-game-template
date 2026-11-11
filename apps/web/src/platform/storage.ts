import { type KeyValueStore } from "./platform.js";

type Attempt<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

/**
 * Creates a {@link KeyValueStore} over `localStorage` that never throws.
 *
 * @remarks
 * Storage is blocked in some iframes and in private mode. The first time
 * `localStorage` is missing or any call on it throws, the store switches to an
 * in-memory map for the rest of the session, so a value written after the
 * failure still reads back.
 *
 * @returns The guarded store.
 */
export function createGuardedStorage(): KeyValueStore {
  const memory = new Map<string, string>();
  let failed = false;

  function backing(): Storage | undefined {
    if (failed) return undefined;
    try {
      // Reading the property itself throws a SecurityError where storage is blocked.
      const storage: unknown = Reflect.get(globalThis, "localStorage");
      if (typeof storage === "object" && storage !== null) return storage as Storage;
    } catch {
      // Falls through to the in-memory map.
    }
    failed = true;
    return undefined;
  }

  function attempt<T>(use: (storage: Storage) => T): Attempt<T> {
    const storage = backing();
    if (storage === undefined) return { ok: false };
    try {
      return { ok: true, value: use(storage) };
    } catch {
      failed = true;
      return { ok: false };
    }
  }

  return {
    getItem(key) {
      const result = attempt((storage) => storage.getItem(key));
      return result.ok ? result.value : (memory.get(key) ?? null);
    },
    setItem(key, value) {
      if (
        !attempt((storage) => {
          storage.setItem(key, value);
        }).ok
      )
        memory.set(key, value);
    },
    removeItem(key) {
      if (
        !attempt((storage) => {
          storage.removeItem(key);
        }).ok
      )
        memory.delete(key);
    },
  };
}

import { type KeyValueStore } from "./platform.js";

type Attempt<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

/**
 * Creates a {@link KeyValueStore} over `localStorage` that never throws.
 *
 * @remarks
 * Storage is blocked in some iframes and in private mode, and a single write can
 * fail with `QuotaExceededError`. Each call is guarded on its own: a write that
 * throws keeps that key in an in-memory overlay, a read checks the overlay first
 * and otherwise tries `localStorage`, and `removeItem` clears both. One failure
 * never turns `localStorage` off for later calls.
 *
 * @returns The guarded store.
 */
export function createGuardedStorage(): KeyValueStore {
  const memory = new Map<string, string>();

  function attempt<T>(use: (storage: Storage) => T): Attempt<T> {
    try {
      // Reading the property itself throws a SecurityError where storage is blocked.
      const storage: unknown = Reflect.get(globalThis, "localStorage");
      if (typeof storage !== "object" || storage === null) return { ok: false };
      return { ok: true, value: use(storage as Storage) };
    } catch {
      return { ok: false };
    }
  }

  return {
    getItem(key) {
      const kept = memory.get(key);
      if (kept !== undefined) return kept;
      const result = attempt((storage) => storage.getItem(key));
      return result.ok ? result.value : null;
    },
    setItem(key, value) {
      const written = attempt((storage) => {
        storage.setItem(key, value);
      }).ok;
      if (written) memory.delete(key);
      else memory.set(key, value);
    },
    removeItem(key) {
      memory.delete(key);
      attempt((storage) => {
        storage.removeItem(key);
      });
    },
  };
}

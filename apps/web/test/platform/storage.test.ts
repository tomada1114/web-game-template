import { describe, expect, it, vi } from "vitest";

import { createGuardedStorage } from "../../src/platform/storage.js";

function memoryStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function quotaExceeded(): never {
  throw new DOMException("quota", "QuotaExceededError");
}

describe("createGuardedStorage", () => {
  it("reads and writes through localStorage when it works", () => {
    const backing = memoryStorage();
    vi.stubGlobal("localStorage", backing);
    const storage = createGuardedStorage();

    storage.setItem("demo:best:2026-11-05", "14");

    expect(backing.getItem("demo:best:2026-11-05")).toBe("14");
    expect(storage.getItem("demo:best:2026-11-05")).toBe("14");
    storage.removeItem("demo:best:2026-11-05");
    expect(backing.getItem("demo:best:2026-11-05")).toBeNull();
  });

  it("returns null for a missing key", () => {
    vi.stubGlobal("localStorage", memoryStorage());

    expect(createGuardedStorage().getItem("absent")).toBeNull();
  });

  it("keeps a write in memory when setItem throws QuotaExceededError", () => {
    vi.stubGlobal("localStorage", { ...memoryStorage(), setItem: quotaExceeded });
    const storage = createGuardedStorage();

    expect(() => {
      storage.setItem("demo:best:2026-11-05", "14");
    }).not.toThrow();
    expect(storage.getItem("demo:best:2026-11-05")).toBe("14");
  });

  it("serves the session from memory when localStorage is missing", () => {
    vi.stubGlobal("localStorage", undefined);
    const storage = createGuardedStorage();

    expect(storage.getItem("k")).toBeNull();
    storage.setItem("k", "v");
    expect(storage.getItem("k")).toBe("v");
    storage.removeItem("k");
    expect(storage.getItem("k")).toBeNull();
  });

  it("does not throw when reading the localStorage property itself throws", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    try {
      const storage = createGuardedStorage();
      storage.setItem("k", "v");
      expect(storage.getItem("k")).toBe("v");
    } finally {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  });

  it("does not throw when getItem or removeItem throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: quotaExceeded,
      setItem: quotaExceeded,
      removeItem: quotaExceeded,
    });
    const storage = createGuardedStorage();

    expect(storage.getItem("k")).toBeNull();
    expect(() => {
      storage.removeItem("k");
    }).not.toThrow();
  });

  it("keeps other localStorage keys readable and later writes durable after a QuotaExceededError", () => {
    const backing = memoryStorage();
    backing.setItem("demo:best:2026-11-04", "9");
    let full = true;
    vi.stubGlobal("localStorage", {
      ...backing,
      setItem: (key: string, value: string) => {
        if (full) quotaExceeded();
        backing.setItem(key, value);
      },
    });
    const storage = createGuardedStorage();

    storage.setItem("demo:best:2026-11-05", "14");
    expect(storage.getItem("demo:best:2026-11-05")).toBe("14");
    expect(storage.getItem("demo:best:2026-11-04")).toBe("9");

    full = false;
    storage.setItem("demo:best:2026-11-06", "3");
    expect(backing.getItem("demo:best:2026-11-06")).toBe("3");
    storage.setItem("demo:best:2026-11-05", "15");
    expect(backing.getItem("demo:best:2026-11-05")).toBe("15");
    expect(storage.getItem("demo:best:2026-11-05")).toBe("15");
  });

  it("removeItem clears both the memory overlay and localStorage", () => {
    const backing = memoryStorage();
    backing.setItem("k", "old");
    let full = true;
    vi.stubGlobal("localStorage", {
      ...backing,
      setItem: (key: string, value: string) => {
        if (full) quotaExceeded();
        backing.setItem(key, value);
      },
    });
    const storage = createGuardedStorage();
    storage.setItem("k", "new");
    full = false;

    storage.removeItem("k");

    expect(storage.getItem("k")).toBeNull();
    expect(backing.getItem("k")).toBeNull();
  });
});

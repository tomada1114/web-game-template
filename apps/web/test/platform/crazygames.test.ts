import { describe, expect, it, vi } from "vitest";

import { createCrazyGamesPlatform } from "../../src/platform/crazygames.js";

const SDK_URL = "https://sdk.crazygames.com/crazygames-sdk-v3.js";

function fakeSdk(
  init: () => Promise<void> = () => Promise.resolve(),
  muteAudio = false,
) {
  const data = new Map<string, string>();
  return {
    init: vi.fn(init),
    game: {
      loadingStart: vi.fn(),
      loadingStop: vi.fn(),
      gameplayStart: vi.fn(),
      gameplayStop: vi.fn(),
      happytime: vi.fn(),
      settings: { muteAudio },
    },
    data: {
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        data.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        data.delete(key);
      }),
    },
  };
}

function quietWarn() {
  return vi.spyOn(console, "warn").mockImplementation(() => undefined);
}

function quietDebug() {
  return vi.spyOn(console, "debug").mockImplementation(() => undefined);
}

describe("createCrazyGamesPlatform", () => {
  it("loads the SDK script once, then awaits SDK.init()", async () => {
    const sdk = fakeSdk();
    const order: string[] = [];
    sdk.init.mockImplementation(() => {
      order.push("init");
      return Promise.resolve();
    });
    const loadScript = vi.fn((url: string) => {
      order.push(url);
      vi.stubGlobal("CrazyGames", { SDK: sdk });
      return Promise.resolve();
    });
    const platform = createCrazyGamesPlatform({ loadScript });

    await platform.init();
    await platform.init();

    expect(loadScript).toHaveBeenCalledTimes(1);
    expect(order).toEqual([SDK_URL, "init"]);
  });

  it("forwards each event to SDK.game exactly once per call", async () => {
    const sdk = fakeSdk();
    vi.stubGlobal("CrazyGames", { SDK: sdk });
    const platform = createCrazyGamesPlatform({ loadScript: () => Promise.resolve() });
    await platform.init();

    platform.loadingStart();
    platform.loadingStop();
    platform.gameplayStart();
    platform.gameplayStop();
    platform.happytime();

    expect(sdk.game.loadingStart).toHaveBeenCalledTimes(1);
    expect(sdk.game.loadingStop).toHaveBeenCalledTimes(1);
    expect(sdk.game.gameplayStart).toHaveBeenCalledTimes(1);
    expect(sdk.game.gameplayStop).toHaveBeenCalledTimes(1);
    expect(sdk.game.happytime).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])(
    "isMuted() returns SDK.game.settings.muteAudio (%s)",
    async (muted) => {
      vi.stubGlobal("CrazyGames", { SDK: fakeSdk(undefined, muted) });
      const platform = createCrazyGamesPlatform({
        loadScript: () => Promise.resolve(),
      });
      await platform.init();

      expect(platform.isMuted()).toBe(muted);
    },
  );

  it("does not throw on events called before init() resolves", () => {
    quietDebug();
    const sdk = fakeSdk();
    vi.stubGlobal("CrazyGames", { SDK: sdk });
    const platform = createCrazyGamesPlatform({
      loadScript: () => new Promise(() => undefined),
    });
    void platform.init();

    expect(() => {
      platform.loadingStart();
      platform.loadingStop();
      platform.gameplayStart();
      platform.gameplayStop();
      platform.happytime();
    }).not.toThrow();
    expect(platform.isMuted()).toBe(false);
    expect(sdk.game.gameplayStart).not.toHaveBeenCalled();
  });

  it("falls back to local with one console.warn when the script fails to load", async () => {
    const warn = quietWarn();
    quietDebug();
    const platform = createCrazyGamesPlatform({
      loadScript: () => Promise.reject(new Error("error event")),
    });

    await expect(platform.init()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(() => {
      platform.happytime();
    }).not.toThrow();
    expect(platform.isMuted()).toBe(false);
  });

  it("falls back with one console.warn when window.CrazyGames is missing after load", async () => {
    const warn = quietWarn();
    vi.stubGlobal("CrazyGames", undefined);
    const platform = createCrazyGamesPlatform({ loadScript: () => Promise.resolve() });

    await platform.init();

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("falls back with one console.warn when SDK.init() rejects", async () => {
    const warn = quietWarn();
    quietDebug();
    const sdk = fakeSdk(() => Promise.reject(new Error("rejected")));
    vi.stubGlobal("CrazyGames", { SDK: sdk });
    const platform = createCrazyGamesPlatform({ loadScript: () => Promise.resolve() });

    await platform.init();
    platform.gameplayStart();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(sdk.game.gameplayStart).not.toHaveBeenCalled();
  });

  it("stays on CrazyGames when SDK.init() settles at 9,999 ms", async () => {
    vi.useFakeTimers();
    try {
      const warn = quietWarn();
      const sdk = fakeSdk(
        () =>
          new Promise((resolve) => {
            setTimeout(resolve, 9_999);
          }),
      );
      vi.stubGlobal("CrazyGames", { SDK: sdk });
      const platform = createCrazyGamesPlatform({
        loadScript: () => Promise.resolve(),
      });

      const done = platform.init();
      await vi.advanceTimersByTimeAsync(9_999);
      await done;
      await vi.advanceTimersByTimeAsync(10_000);
      platform.gameplayStart();

      expect(warn).not.toHaveBeenCalled();
      expect(sdk.game.gameplayStart).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back after 10,000 ms and a late resolution does not switch back", async () => {
    vi.useFakeTimers();
    try {
      const warn = quietWarn();
      quietDebug();
      let resolveInit: () => void = () => undefined;
      const sdk = fakeSdk(
        () =>
          new Promise<void>((resolve) => {
            resolveInit = resolve;
          }),
      );
      vi.stubGlobal("CrazyGames", { SDK: sdk });
      const platform = createCrazyGamesPlatform({
        loadScript: () => Promise.resolve(),
      });

      const done = platform.init();
      await vi.advanceTimersByTimeAsync(10_000);
      await expect(done).resolves.toBeUndefined();
      resolveInit();
      await vi.advanceTimersByTimeAsync(0);
      platform.gameplayStart();

      expect(warn).toHaveBeenCalledTimes(1);
      expect(sdk.game.gameplayStart).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("never calls SDK.init() when the script loads after the timeout", async () => {
    vi.useFakeTimers();
    try {
      const warn = quietWarn();
      quietDebug();
      const sdk = fakeSdk();
      vi.stubGlobal("CrazyGames", { SDK: sdk });
      const platform = createCrazyGamesPlatform({
        loadScript: () =>
          new Promise((resolve) => {
            setTimeout(resolve, 12_000);
          }),
      });

      const done = platform.init();
      await vi.advanceTimersByTimeAsync(10_000);
      await done;
      await vi.advanceTimersByTimeAsync(5_000);
      platform.gameplayStart();

      expect(sdk.init).not.toHaveBeenCalled();
      expect(sdk.game.gameplayStart).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back with one console.warn when the global has init but no game", async () => {
    const warn = quietWarn();
    quietDebug();
    const init = vi.fn(() => Promise.resolve());
    vi.stubGlobal("CrazyGames", { SDK: { init } });
    const platform = createCrazyGamesPlatform({ loadScript: () => Promise.resolve() });

    await platform.init();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(init).not.toHaveBeenCalled();
    expect(() => {
      platform.gameplayStart();
    }).not.toThrow();
    expect(platform.isMuted()).toBe(false);
  });

  it("falls back to local with one console.warn when SDK lifecycle calls throw", async () => {
    const warn = quietWarn();
    quietDebug();
    const sdk = fakeSdk();
    const fail = () => {
      throw new Error("sdk");
    };
    for (const event of [
      sdk.game.loadingStart,
      sdk.game.loadingStop,
      sdk.game.gameplayStart,
      sdk.game.gameplayStop,
      sdk.game.happytime,
    ]) {
      event.mockImplementation(fail);
    }
    Object.defineProperty(sdk.game.settings, "muteAudio", { get: fail });
    vi.stubGlobal("CrazyGames", { SDK: sdk });
    const platform = createCrazyGamesPlatform({ loadScript: () => Promise.resolve() });
    await platform.init();

    expect(() => {
      platform.loadingStart();
      platform.loadingStop();
      platform.gameplayStart();
      platform.gameplayStop();
      platform.happytime();
    }).not.toThrow();
    expect(platform.isMuted()).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  describe("storage", () => {
    it("uses SDK.data when the Data module is enabled and the SDK is up", async () => {
      const backing = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
      vi.stubGlobal("localStorage", backing);
      const sdk = fakeSdk();
      vi.stubGlobal("CrazyGames", { SDK: sdk });
      const platform = createCrazyGamesPlatform({
        loadScript: () => Promise.resolve(),
        useDataModule: true,
      });
      await platform.init();

      platform.storage.setItem("k", "v");
      expect(platform.storage.getItem("k")).toBe("v");
      platform.storage.removeItem("k");

      expect(sdk.data.setItem).toHaveBeenCalledWith("k", "v");
      expect(sdk.data.removeItem).toHaveBeenCalledWith("k");
      expect(platform.storage.getItem("k")).toBeNull();
      expect(backing.setItem).not.toHaveBeenCalled();
      expect(backing.getItem).not.toHaveBeenCalled();
    });

    it("uses guarded localStorage when the Data module is not enabled", async () => {
      const backing = {
        getItem: vi.fn(() => "local"),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      };
      vi.stubGlobal("localStorage", backing);
      const sdk = fakeSdk();
      vi.stubGlobal("CrazyGames", { SDK: sdk });
      const platform = createCrazyGamesPlatform({
        loadScript: () => Promise.resolve(),
      });
      await platform.init();

      platform.storage.setItem("k", "v");
      platform.storage.removeItem("k");

      expect(platform.storage.getItem("k")).toBe("local");
      expect(backing.setItem).toHaveBeenCalledWith("k", "v");
      expect(backing.removeItem).toHaveBeenCalledWith("k");
      expect(sdk.data.setItem).not.toHaveBeenCalled();
    });

    it("uses guarded localStorage when the Data module is enabled but the SDK failed", async () => {
      quietWarn();
      const backing = {
        getItem: vi.fn(() => "local"),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      };
      vi.stubGlobal("localStorage", backing);
      const platform = createCrazyGamesPlatform({
        loadScript: () => Promise.reject(new Error("offline")),
        useDataModule: true,
      });
      await platform.init();

      platform.storage.setItem("k", "v");

      expect(backing.setItem).toHaveBeenCalledWith("k", "v");
      expect(platform.storage.getItem("k")).toBe("local");
    });

    it("never throws when SDK.data throws", async () => {
      vi.stubGlobal("localStorage", undefined);
      const sdk = fakeSdk();
      const fail = () => {
        throw new Error("data module");
      };
      sdk.data.getItem.mockImplementation(fail);
      sdk.data.setItem.mockImplementation(fail);
      sdk.data.removeItem.mockImplementation(fail);
      vi.stubGlobal("CrazyGames", { SDK: sdk });
      const platform = createCrazyGamesPlatform({
        loadScript: () => Promise.resolve(),
        useDataModule: true,
      });
      await platform.init();

      platform.storage.setItem("k", "v");
      expect(platform.storage.getItem("k")).toBe("v");
      platform.storage.removeItem("k");
      expect(platform.storage.getItem("k")).toBeNull();
    });
  });

  it("stays on the guarded local store after the first SDK.data throw", async () => {
    const backing = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => {
        backing.set(key, value);
      },
      removeItem: (key: string) => {
        backing.delete(key);
      },
    });
    const sdk = fakeSdk();
    sdk.data.setItem.mockImplementationOnce(() => {
      throw new Error("data module");
    });
    vi.stubGlobal("CrazyGames", { SDK: sdk });
    const platform = createCrazyGamesPlatform({
      loadScript: () => Promise.resolve(),
      useDataModule: true,
    });
    await platform.init();

    platform.storage.setItem("k", "v");
    platform.storage.setItem("j", "w");

    expect(platform.storage.getItem("k")).toBe("v");
    expect(platform.storage.getItem("j")).toBe("w");
    expect(sdk.data.setItem).toHaveBeenCalledTimes(1);
    expect(sdk.data.getItem).not.toHaveBeenCalled();
    expect(backing.get("j")).toBe("w");
  });
});

import { describe, expect, it, vi } from "vitest";

import { selectPlatform } from "../../src/platform/select.js";

const SDK_URL = "https://sdk.crazygames.com/crazygames-sdk-v3.js";

function fakeSdk() {
  return {
    init: () => Promise.resolve(),
    game: {
      loadingStart: vi.fn(),
      loadingStop: vi.fn(),
      gameplayStart: vi.fn(),
      gameplayStop: vi.fn(),
      happytime: vi.fn(),
      settings: { muteAudio: false },
    },
    data: { getItem: vi.fn(() => "from-data"), setItem: vi.fn(), removeItem: vi.fn() },
  };
}

describe("selectPlatform", () => {
  it.each([undefined, "local", "poki"])(
    "returns the local platform and injects no script when VITE_PLATFORM is %s",
    async (value) => {
      if (value !== undefined) vi.stubEnv("VITE_PLATFORM", value);
      vi.spyOn(console, "debug").mockImplementation(() => undefined);
      const loadScript = vi.fn(() => Promise.resolve());
      const sdk = fakeSdk();
      vi.stubGlobal("CrazyGames", { SDK: sdk });

      const platform = await selectPlatform({ loadScript });
      await platform.init();
      platform.gameplayStart();

      expect(loadScript).not.toHaveBeenCalled();
      expect(sdk.game.gameplayStart).not.toHaveBeenCalled();
    },
  );

  it("returns the CrazyGames platform when VITE_PLATFORM is crazygames", async () => {
    vi.stubEnv("VITE_PLATFORM", "crazygames");
    const loadScript = vi.fn(() => Promise.resolve());
    const sdk = fakeSdk();
    vi.stubGlobal("CrazyGames", { SDK: sdk });

    const platform = await selectPlatform({ loadScript });
    await platform.init();
    platform.gameplayStart();

    expect(loadScript).toHaveBeenCalledExactlyOnceWith(SDK_URL);
    expect(sdk.game.gameplayStart).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["1", "from-data"],
    ["0", "from-local"],
  ])("with VITE_CRAZYGAMES_DATA=%s storage reads %s", async (flag, expected) => {
    vi.stubEnv("VITE_PLATFORM", "crazygames");
    vi.stubEnv("VITE_CRAZYGAMES_DATA", flag);
    vi.stubGlobal("localStorage", {
      getItem: () => "from-local",
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    vi.stubGlobal("CrazyGames", { SDK: fakeSdk() });

    const platform = await selectPlatform({ loadScript: () => Promise.resolve() });
    await platform.init();

    expect(platform.storage.getItem("k")).toBe(expected);
  });
});

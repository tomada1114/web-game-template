import { describe, expect, it, vi } from "vitest";

import { createLocalPlatform } from "../../src/platform/local.js";
import { type Platform } from "../../src/platform/platform.js";

const EVENTS = [
  "loadingStart",
  "loadingStop",
  "gameplayStart",
  "gameplayStop",
  "happytime",
] as const satisfies readonly (keyof Platform)[];

describe("createLocalPlatform", () => {
  it("logs each event with console.debug in dev", async () => {
    vi.stubEnv("DEV", true);
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const platform = createLocalPlatform();
    await platform.init();

    for (const event of EVENTS) platform[event]();

    expect(debug).toHaveBeenCalledTimes(EVENTS.length);
  });

  it("logs nothing outside dev", () => {
    vi.stubEnv("DEV", false);
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const platform = createLocalPlatform();

    for (const event of EVENTS) platform[event]();

    expect(debug).not.toHaveBeenCalled();
  });

  it("is never muted and exposes the store it was given", () => {
    const store = { getItem: () => "x", setItem: vi.fn(), removeItem: vi.fn() };
    const platform = createLocalPlatform(store);

    expect(platform.isMuted()).toBe(false);
    expect(platform.storage).toBe(store);
  });
});

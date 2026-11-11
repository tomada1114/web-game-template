import { type KeyValueStore, type Platform } from "./platform.js";
import { createGuardedStorage } from "./storage.js";

/**
 * Creates the platform `pnpm dev` and the local build run on.
 *
 * @remarks
 * Every event is a no-op, traced with `console.debug` in dev builds only, and
 * the game is never muted.
 *
 * @param storage - The store to expose; defaults to a fresh guarded `localStorage`.
 * @returns The local platform.
 */
export function createLocalPlatform(
  storage: KeyValueStore = createGuardedStorage(),
): Platform {
  function trace(event: string): void {
    if (import.meta.env.DEV) console.debug(`[platform:local] ${event}`);
  }
  return {
    init: () => Promise.resolve(),
    loadingStart: () => {
      trace("loadingStart");
    },
    loadingStop: () => {
      trace("loadingStop");
    },
    gameplayStart: () => {
      trace("gameplayStart");
    },
    gameplayStop: () => {
      trace("gameplayStop");
    },
    happytime: () => {
      trace("happytime");
    },
    isMuted: () => false,
    storage,
  };
}

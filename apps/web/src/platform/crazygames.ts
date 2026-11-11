import { createLocalPlatform } from "./local.js";
import { type KeyValueStore, type Platform } from "./platform.js";

/** The CrazyGames HTML5 SDK v3 script, loaded at runtime; there is no npm package. */
export const CRAZYGAMES_SDK_URL = "https://sdk.crazygames.com/crazygames-sdk-v3.js";

/** How long `init()` waits for the script and `SDK.init()` before falling back to local. */
export const CRAZYGAMES_INIT_TIMEOUT_MS = 10_000;

/** The members of `window.CrazyGames.SDK` this adapter uses, and only those. */
export interface CrazyGamesSdk {
  /** Initializes the SDK; settles before any other call is made. */
  init(): Promise<void>;
  /** The game module: lifecycle events and portal settings. */
  readonly game: {
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    happytime(): void;
    readonly settings: { readonly muteAudio: boolean };
  };
  /** The Data module, with the `localStorage` API; enabled by Progress Save at submission. */
  readonly data: KeyValueStore;
}

/** The shape of `window.CrazyGames`, as far as this adapter reads it. */
export interface CrazyGamesGlobal {
  /** The SDK the v3 script installs. */
  readonly SDK: CrazyGamesSdk;
}

/** Options for {@link createCrazyGamesPlatform}. */
export interface CrazyGamesPlatformOptions {
  /** Loads the SDK script; resolves once it has run. */
  readonly loadScript: (url: string) => Promise<void>;
  /** Maps `storage` to `SDK.data` once the SDK is up (`VITE_CRAZYGAMES_DATA=1`). Defaults to `false`. */
  readonly useDataModule?: boolean;
}

function isCrazyGamesGlobal(value: unknown): value is CrazyGamesGlobal {
  if (typeof value !== "object" || value === null) return false;
  const sdk: unknown = Reflect.get(value, "SDK");
  return (
    typeof sdk === "object" &&
    sdk !== null &&
    typeof Reflect.get(sdk, "init") === "function"
  );
}

function readSdk(): CrazyGamesSdk {
  // In a browser `globalThis` is `window`, so this reads `window.CrazyGames`.
  const global: unknown = Reflect.get(globalThis, "CrazyGames");
  if (!isCrazyGamesGlobal(global)) {
    throw new Error("window.CrazyGames.SDK is missing after the script loaded");
  }
  return global.SDK;
}

/**
 * Creates the platform for the CrazyGames build.
 *
 * @remarks
 * `init()` loads {@link CRAZYGAMES_SDK_URL} once and awaits `SDK.init()`. If the
 * script fails, `SDK.init()` rejects, or the two do not settle within
 * {@link CRAZYGAMES_INIT_TIMEOUT_MS}, the platform stays local for the session
 * and logs exactly one `console.warn`; a late resolution does not switch back.
 * Until `init()` succeeds, every method behaves as the local platform.
 *
 * @param options - The script loader and the Data module switch.
 * @returns The CrazyGames platform.
 */
export function createCrazyGamesPlatform(options: CrazyGamesPlatformOptions): Platform {
  const local = createLocalPlatform();
  let sdk: CrazyGamesSdk | undefined;
  let initializing: Promise<void> | undefined;

  async function start(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error(
            `SDK did not settle within ${String(CRAZYGAMES_INIT_TIMEOUT_MS)} ms`,
          ),
        );
      }, CRAZYGAMES_INIT_TIMEOUT_MS);
    });
    const ready = (async () => {
      await options.loadScript(CRAZYGAMES_SDK_URL);
      const candidate = readSdk();
      await candidate.init();
      return candidate;
    })();
    // The losing branch of the race may still reject later; that is expected.
    ready.catch(() => undefined);
    try {
      sdk = await Promise.race([ready, timeout]);
    } catch (error: unknown) {
      console.warn("CrazyGames SDK unavailable; running on the local platform.", error);
    } finally {
      clearTimeout(timer);
    }
  }

  function dataModule(): KeyValueStore | undefined {
    return options.useDataModule === true ? sdk?.data : undefined;
  }

  function through<T>(onData: (data: KeyValueStore) => T, onLocal: () => T): T {
    const data = dataModule();
    if (data !== undefined) {
      try {
        return onData(data);
      } catch {
        // Falls back to the guarded store, which never throws.
      }
    }
    return onLocal();
  }

  const storage: KeyValueStore = {
    getItem: (key) =>
      through(
        (data) => data.getItem(key),
        () => local.storage.getItem(key),
      ),
    setItem: (key, value) => {
      through(
        (data) => {
          data.setItem(key, value);
        },
        () => {
          local.storage.setItem(key, value);
        },
      );
    },
    removeItem: (key) => {
      through(
        (data) => {
          data.removeItem(key);
        },
        () => {
          local.storage.removeItem(key);
        },
      );
    },
  };

  return {
    init() {
      initializing ??= start();
      return initializing;
    },
    loadingStart: () => {
      if (sdk) sdk.game.loadingStart();
      else local.loadingStart();
    },
    loadingStop: () => {
      if (sdk) sdk.game.loadingStop();
      else local.loadingStop();
    },
    gameplayStart: () => {
      if (sdk) sdk.game.gameplayStart();
      else local.gameplayStart();
    },
    gameplayStop: () => {
      if (sdk) sdk.game.gameplayStop();
      else local.gameplayStop();
    },
    happytime: () => {
      if (sdk) sdk.game.happytime();
      else local.happytime();
    },
    isMuted: () => sdk?.game.settings.muteAudio ?? false,
    storage,
  };
}

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

type LifecycleEvent =
  "loadingStart" | "loadingStop" | "gameplayStart" | "gameplayStop" | "happytime";

const LIFECYCLE_EVENTS: readonly LifecycleEvent[] = [
  "loadingStart",
  "loadingStop",
  "gameplayStart",
  "gameplayStop",
  "happytime",
];

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function isCrazyGamesGlobal(value: unknown): value is CrazyGamesGlobal {
  if (!isObject(value)) return false;
  const sdk: unknown = Reflect.get(value, "SDK");
  if (!isObject(sdk) || typeof Reflect.get(sdk, "init") !== "function") return false;
  const game: unknown = Reflect.get(sdk, "game");
  if (!isObject(game)) return false;
  if (
    !LIFECYCLE_EVENTS.every((event) => typeof Reflect.get(game, event) === "function")
  ) {
    return false;
  }
  return isObject(Reflect.get(game, "settings"));
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
 * Until `init()` succeeds, every method behaves as the local platform; that
 * includes `storage`, so a call made before `init()` settles uses the guarded
 * local store (`main.ts` awaits `init()` before creating the game). After init,
 * an SDK call that throws falls back to local for that call and logs one
 * `console.warn` for the session; the first `SDK.data` throw moves `storage` to
 * the guarded local store for the rest of the session.
 *
 * @param options - The script loader and the Data module switch.
 * @returns The CrazyGames platform.
 */
export function createCrazyGamesPlatform(options: CrazyGamesPlatformOptions): Platform {
  const local = createLocalPlatform();
  let sdk: CrazyGamesSdk | undefined;
  let initializing: Promise<void> | undefined;
  let dataFailed = false;
  let sdkCallWarned = false;

  function warnSdkCall(error: unknown): void {
    if (sdkCallWarned) return;
    sdkCallWarned = true;
    console.warn("CrazyGames SDK call failed; using local behaviour.", error);
  }

  function guarded<T>(onSdk: (active: CrazyGamesSdk) => T, onLocal: () => T): T {
    if (sdk) {
      try {
        return onSdk(sdk);
      } catch (error: unknown) {
        warnSdkCall(error);
      }
    }
    return onLocal();
  }

  function forward(event: LifecycleEvent): () => void {
    return () => {
      guarded(
        (active) => {
          active.game[event]();
        },
        () => {
          local[event]();
        },
      );
    };
  }

  async function start(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController();
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        abort.abort();
        reject(
          new Error(
            `SDK did not settle within ${String(CRAZYGAMES_INIT_TIMEOUT_MS)} ms`,
          ),
        );
      }, CRAZYGAMES_INIT_TIMEOUT_MS);
    });
    const ready = (async () => {
      await options.loadScript(CRAZYGAMES_SDK_URL);
      // A script that loads after the timeout must not initialize an SDK nobody drives.
      if (abort.signal.aborted) throw new Error("SDK script loaded after the timeout");
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
    return options.useDataModule === true && !dataFailed ? sdk?.data : undefined;
  }

  function through<T>(onData: (data: KeyValueStore) => T, onLocal: () => T): T {
    const data = dataModule();
    if (data !== undefined) {
      try {
        return onData(data);
      } catch {
        // Reading SDK.data after a failed write would return stale or missing data.
        dataFailed = true;
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
    loadingStart: forward("loadingStart"),
    loadingStop: forward("loadingStop"),
    gameplayStart: forward("gameplayStart"),
    gameplayStop: forward("gameplayStop"),
    happytime: forward("happytime"),
    isMuted: () =>
      guarded(
        (active) => active.game.settings.muteAudio,
        () => local.isMuted(),
      ),
    storage,
  };
}

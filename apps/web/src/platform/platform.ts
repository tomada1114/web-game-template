/**
 * A string key-value store with the `localStorage` API.
 *
 * @remarks
 * No method ever throws: a store that cannot persist serves the session from
 * memory, so callers never wrap a call in try/catch.
 */
export interface KeyValueStore {
  /** Returns the value stored under `key`, or `null` when there is none. */
  getItem(key: string): string | null;
  /** Stores `value` under `key`, replacing any earlier value. */
  setItem(key: string, value: string): void;
  /** Removes the value stored under `key`; a missing key is not an error. */
  removeItem(key: string): void;
}

/**
 * The one seam between the game and the portal it runs on.
 *
 * @remarks
 * Scenes call this interface and nothing else; a portal name or SDK call
 * outside `apps/web/src/platform/` is a bug. Every method is safe to call
 * before {@link Platform.init} resolves.
 */
export interface Platform {
  /**
   * Prepares the portal SDK. Never rejects: on any SDK failure the platform
   * falls back to local behavior for the session.
   */
  init(): Promise<void>;
  /** Boot's preload started. */
  loadingStart(): void;
  /** Title first became interactive. */
  loadingStop(): void;
  /** A board became playable. */
  gameplayStart(): void;
  /** Gameplay broke off: entering Result, or Back from Play. */
  gameplayStop(): void;
  /** The stored Daily best increased. */
  happytime(): void;
  /** Whether the portal asks the game to mute its audio. */
  isMuted(): boolean;
  /** Where the game keeps its scores; see {@link KeyValueStore}. */
  readonly storage: KeyValueStore;
}

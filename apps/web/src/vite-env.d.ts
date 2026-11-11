/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The portal this build targets: `crazygames`; unset or any other value means `local`. */
  readonly VITE_PLATFORM?: string;
  /** `"1"` maps `Platform.storage` to the CrazyGames Data module in the `crazygames` build. */
  readonly VITE_CRAZYGAMES_DATA?: string;
}

import { createCrazyGamesPlatform } from "./crazygames.js";
import { loadScriptElement } from "./dom-loader.js";
import { createLocalPlatform } from "./local.js";
import { type Platform } from "./platform.js";

/** Options for {@link selectPlatform}. */
export interface SelectPlatformOptions {
  /** Loads a portal SDK script; defaults to inserting a `<script>` element. */
  readonly loadScript?: (url: string) => Promise<void>;
}

/**
 * Returns the platform this build targets, from `VITE_PLATFORM` at build time.
 *
 * @remarks
 * `crazygames` selects the CrazyGames platform, with `storage` on the Data
 * module when `VITE_CRAZYGAMES_DATA` is `"1"`; unset or any other value selects
 * the local platform, which injects no script. The caller still awaits
 * {@link Platform.init}.
 *
 * @param options - Overrides for the SDK script loader.
 * @returns The selected, not yet initialized, platform.
 */
export function selectPlatform(options: SelectPlatformOptions = {}): Promise<Platform> {
  if (import.meta.env.VITE_PLATFORM === "crazygames") {
    return Promise.resolve(
      createCrazyGamesPlatform({
        loadScript: options.loadScript ?? loadScriptElement,
        useDataModule: import.meta.env.VITE_CRAZYGAMES_DATA === "1",
      }),
    );
  }
  return Promise.resolve(createLocalPlatform());
}

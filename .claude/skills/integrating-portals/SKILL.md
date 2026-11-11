---
name: integrating-portals
description: >
  Use when working on apps/web/src/platform/** (platform.ts, local.ts, crazygames.ts,
  select.ts, storage.ts), VITE_PLATFORM or VITE_CRAZYGAMES_DATA, the CrazyGames HTML5
  SDK v3 (crazygames-sdk-v3.js, SDK.init, loadingStart, gameplayStart, gameplayStop,
  happytime, muteAudio, the Data module), localStorage or KeyValueStore, the best-score
  key, pnpm budget, pnpm package:crazygames, scripts/check-budget.mjs,
  scripts/package-crazygames.mjs, Vite base "./", a failed zip or budget check, or a
  CrazyGames technical requirement.
---

# Integrating Portals

**Owns:** the `Platform` seam in `apps/web/src/platform/`, the CrazyGames SDK
integration, storage, the portal build and zip, and the portal requirements the
repository keeps. **Does not own:** where scenes call the platform (`building-scenes`);
version, tag, and GitHub Release (`releasing-builds`); the `.mjs` authoring contract the
two scripts follow (`.claude/rules/scripts.md`); wiring a script into `pnpm check` or CI
(`.claude/rules/gates.md`).

## Platform interface

- `apps/web/src/platform/platform.ts` declares
  `Platform { init(): Promise<void>; loadingStart(); loadingStop(); gameplayStart(); gameplayStop(); happytime(); isMuted(): boolean; storage: KeyValueStore }`,
  with
  `KeyValueStore { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }`
  — the `localStorage` API, and no method ever throws.
- `apps/web/src/main.ts` awaits `selectPlatform()` and `init()`, with a 10 s timeout and
  fallback to local, and only then creates the `Phaser.Game`.
- ESLint allows `console.warn` and `console.debug` in `apps/web/src/platform/**` only;
  no disable directives.
- `select.ts` reads `import.meta.env.VITE_PLATFORM` at build time: `local` (the default,
  used by `pnpm dev`) or `crazygames`. `local.ts` makes every event a no-op, logged with
  `console.debug` in dev only.
- The interface is the only seam a portal plugs into. A portal name,
  `window.CrazyGames`, or an SDK call anywhere outside `apps/web/src/platform/` is a
  bug; a scene calls `Platform` and nothing else.
- When each event fires — the single home for these rules:
  - `loadingStart` when Boot's preload starts; `loadingStop` once, when Title first
    becomes interactive.
  - `gameplayStart` every time a board becomes playable: daily, Practice, Again.
  - `gameplayStop` at every break: on entering Result and when Back leaves Play, never
    twice in a row. Leaving Result for Title sends nothing. Never on tab blur — the
    portal handles that.
  - `happytime` only when the stored Daily best increased; Practice never calls it. It
    is a celebration, not a per-move effect.
- No network request exists besides the SDK script and its calls: no analytics, no
  `fetch`, no other third-party script.

## CrazyGames SDK

- `crazygames.ts` injects `https://sdk.crazygames.com/crazygames-sdk-v3.js` at runtime,
  only in the `crazygames` build, then awaits `window.CrazyGames.SDK.init()`. There is
  no npm package (https://docs.crazygames.com/sdk/intro/, checked 2026-11-05). The types
  for `window.CrazyGames` are written by hand and cover only the members used.
- `crazygames.ts` takes the script loader as a parameter,
  `loadScript(url): Promise<void>`. The default, which inserts the `<script>` element,
  lives in the tiny `apps/web/src/platform/dom-loader.ts`, which counts toward the
  `apps/web` coverage floor like any other file; its unit test passes a stubbed
  `document` through `vi.stubGlobal`. Tests use no DOM-emulation dependency: they pass a
  fake loader and stub `window.CrazyGames` and `localStorage` with `vi.stubGlobal`.
- Events forward to `SDK.game.loadingStart/Stop`, `gameplayStart/Stop`, and
  `happytime()`. Stop gameplay at every break, not on tab blur; the first
  `gameplayStart` marks the end of the initial download; call `happytime()` sparingly.
  `SDK.game.settings.muteAudio` overrides in-game audio, and `isMuted()` reads it
  (https://docs.crazygames.com/sdk/game/, checked 2026-11-05).
- Fallback: if the script fails to load, `init()` rejects, or `init()` does not settle
  within 10 s, the game runs on the `local` platform and stays playable, shows the
  player nothing, and logs one `console.warn`. Never `console.error` — the boot smoke
  test fails on it, and the player never sees a message.
- Basic Launch: the SDK is optional, but once integrated a `gameplayStart` event is
  required, and ads are not allowed. Full Launch: the SDK is required with gameplay
  start/stop, and the Data and User modules where applicable
  (https://docs.crazygames.com/requirements/technical/, checked 2026-11-05). The
  template makes no ad calls.
- The template has no sound. A game that adds sound honours `muteAudio` over its own
  toggle and resumes a suspended `AudioContext` inside a user gesture, which iOS
  requires (same requirements page).

## Storage

- Every read and write goes through `Platform.storage`, a `KeyValueStore` that never
  throws. `storage.ts` wraps `localStorage` in try/catch with an in-memory fallback,
  because iframe storage is blocked in some browsers and in private mode.
- Callers never wrap storage in try/catch. A failed write means the best score is not
  kept; the game shows no error, hides "Best", and keeps playing.
- The daily best is stored under `<slug>:best:<YYYY-MM-DD>` (the session's day, fixed at
  the first Title open) as an integer 1–20. A Daily score is a new best when `score > 0`
  and either no best is stored or `score >` the stored best; 0 is never stored. Practice
  has no best. The slug prefix keeps one game's keys apart from any other game served
  from the same origin.
- The CrazyGames Data module has the same API as `localStorage`. It is enabled only by
  the Progress Save toggle at submission, after which the game must rely on it fully;
  its limit is 1 MB of JSON (https://docs.crazygames.com/sdk/data/, checked 2026-11-05).
  `KeyValueStore` maps to it only when `VITE_CRAZYGAMES_DATA=1`; the default is guarded
  `localStorage`. Set the variable only for a game submitted with Progress Save on;
  whether to do so is each game's decision.

## Packaging

- Vite builds with `base: "./"` — CrazyGames loads files by relative path only — and the
  portal build sets `build.sourcemap: false`.
- `pnpm budget [dir]` (`scripts/check-budget.mjs`, default `apps/web/dist`) sums the
  directory and fails the gate (`ERR_BUDGET_EXCEEDED`) over 5,242,880 bytes or 300 files
  — both inclusive, so 5,242,880 bytes and 300 files pass — printing the five largest
  files. The portal's own ceiling for the mobile homepage is 20 MB; a budget at the
  ceiling would warn only once it is too late. Phaser is most of the template's weight:
  `phaser.min.js` 4.2.1 measures 1,375,976 bytes (352,441 gzip;
  https://cdn.jsdelivr.net/npm/phaser@4.2.1/dist/phaser.min.js, checked 2026-11-05).
- When the budget fails, read the five-file list and shrink or drop the asset. Raising
  the limit is a gate change, not a fix. See the conventions in
  `.claude/rules/gates.md`.
- `pnpm package:crazygames` (`scripts/package-crazygames.mjs`) builds with
  `VITE_PLATFORM=crazygames` into the `crazygames` folder under `.package`, runs the
  budget on that directory, and zips its contents into
  `.package/<slug>-<version>-crazygames.zip`: `<slug>` is the root `package.json`
  `name`, the version comes from `apps/web/package.json` (so a freshly cut game's zip is
  `<slug>-0.0.0-crazygames.zip`). The local build in `apps/web/dist` is never
  overwritten, so the e2e preview always serves the local build. It then checks the zip:
  `index.html` at the root (`ERR_ZIP_LAYOUT`), no `.map` file (`ERR_ZIP_SOURCEMAP`), no
  root-absolute `src="/` or `href="/` (`ERR_ZIP_ABSOLUTE_PATH`). `.package` is
  gitignored. It uses Node built-ins only (`node:zlib` deflate-raw), so packaging adds
  no dependency.
- Each zip check catches a mistake that breaks the game on the portal: zipping the
  `dist` folder rather than its contents puts `index.html` one level down, and a
  root-absolute URL resolves against the portal's origin instead of the game's.
- Both scripts run inside `pnpm check`. Uploading the zip is manual. **BACKGROUND:**
  `releasing-builds`.

## Requirements to keep

The CrazyGames technical requirements
(https://docs.crazygames.com/requirements/technical/, checked 2026-11-05), and what in
the repository keeps each one:

| Requirement                                               | Kept by                                        |
| --------------------------------------------------------- | ---------------------------------------------- |
| Total size ≤ 250 MB, ≤ 1500 files                         | `pnpm budget` (5 MB, 300 files)                |
| Initial download ≤ 50 MB; ≤ 20 MB for the mobile homepage | `pnpm budget`                                  |
| Relative paths only                                       | `base: "./"` and the zip's root-absolute check |
| Mouse, keyboard, and touch on mobile                      | `docs/design/ux-guidelines.md` § Input         |
| `user-select: none` on `body`                             | `apps/web` page CSS, with vendor prefixes      |
| Works on Chrome and Edge; disabled on Safari if broken    | the Chromium boot smoke test                   |
| Safe areas in the CrazyGames app                          | nothing automated; checked by hand in the app  |
| Resume `AudioContext` in a user gesture on iOS            | any game that adds sound                       |

`touch-action: none` on the canvas keeps a touch on the board from scrolling or zooming
the portal page around it.

# Web Game Template — Requirements

- **Status:** Signed off 2026-11-05 (details delegated by the owner:
  "細かいことはできるだけ任せる")
- **Platform and stack:** Web (desktop and mobile browsers, inside portal iframes). Cut
  from `tomada1114/typescript-template`, which fixes TypeScript, Node 24, pnpm 11 via
  Corepack, ESLint, Prettier, Vitest, lefthook and the pnpm supply-chain settings. This
  template adds Vite 8, Phaser 4 and the CrazyGames HTML5 SDK v3.

## 1. Overview

A GitHub template repository for small 2D browser games written in TypeScript and built
mostly by coding agents. A repository cut from it starts with a playable sample game,
the checks a game needs, and the agent harness (skills, issue conventions,
`shipping-issues`) — so the first issue of a new game is about the game, not the setup.

- **Target user:** one solo developer with web-app experience and little game
  experience, 3–6 hours a week, publishing free games on browser portals (CrazyGames
  first), later adding a server-verified daily challenge and an iOS build.
- **Core interaction:** cut a repository → run the bootstrap → `pnpm dev` shows the
  sample in the browser → change the rules in `packages/core` with tests → `pnpm build`
  and `pnpm package:crazygames` produce a zip ready to upload.
- **The constraint everything follows:** game rules are deterministic. The same seed and
  the same list of moves give the same state and score on every JavaScript engine (V8,
  JavaScriptCore, SpiderMonkey), so a later server can replay a run to verify it and
  every player gets the same daily board.

## 2. Scope

### MVP

- **Workspace layout** — `packages/core` (rules) and `apps/web` (rendering and
  platform), so the rules can later run in a Worker without the renderer (§3.1).
- **Deterministic core with a sample game** — seeded PRNG, seed derivation, daily seed,
  replay, and a tiny sample ruleset that exercises all of them (§3.2).
- **Determinism guard** — lint rules that keep non-deterministic APIs out of
  `packages/core`, plus golden tests (§3.3).
- **Web shell** — Phaser 4 scenes Boot → Title → Play → Result rendering the core state
  (§3.4).
- **Platform adapter** — a `Platform` interface with `local` and `crazygames`
  implementations, chosen at build time (§3.5).
- **Daily mode** — the sample's daily board, local best score, and a share text (§3.6).
- **Build, budget and portal package** — a relative-path build, a size budget that fails
  the gate, and a CrazyGames zip (§3.7).
- **Release workflow** — a version tag builds the zip and attaches it to a GitHub
  Release (§3.8).
- **Boot smoke test** — the built game boots in a real browser without console errors
  and accepts one move (§3.9).
- **Game bootstrap and agent harness** — a bootstrap that renames the template into a
  game, an `AGENTS.md` Product section placeholder that fails the checks until written,
  and the skills a kickoff expects: `starting-an-app`, `designing-ui`,
  `triaging-issues`, `shipping-issues` (§3.10).

### Later

- **Replay-verification server** (`apps/worker`, Cloudflare Workers + D1) — waits until
  a game gets traction on a portal; `packages/core` is already importable by it.
- **iOS build** (Capacitor 8 wrapping `apps/web`) — same trigger.
- **Cross-engine determinism run** — golden tests in Chromium, WebKit and Firefox
  (Vitest browser mode or Playwright); pulled forward if a golden test ever differs
  between Node and a browser.
- **Poki adapter** — added only when a game is accepted there.
- **Audio** — a mute-aware sound helper (CrazyGames Full Launch requires honoring
  `muteAudio`, https://docs.crazygames.com/sdk/game/, checked 2026-11-05); pulled
  forward by the first game that ships sound.
- **Localization** — sample UI is English only.

### Non-goals

- 3D, physics engines, real-time multiplayer — they break determinism or the scope a
  solo hobby game can carry.
- npm publishing — a game is not a package; the template's npm release, provenance,
  type-export and package-smoke machinery is removed, not kept dormant.
- Ads and monetization calls — CrazyGames Basic Launch does not allow ads; a game adds
  them at Full Launch (https://docs.crazygames.com/requirements/technical/, checked
  2026-11-05).
- Accounts, login, analytics, or any network request other than the portal SDK.
- Asset pipelines (texture atlases, sprite tooling), level editors, ECS frameworks.
- Other engines (Unity, Godot, PixiJS) — the template is Phaser-only; the core stays
  engine-free so a renderer swap stays possible.

## 3. Features

### 3.1 Workspace layout

| Item            | Specification                                                                                                                                                                                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package manager | pnpm workspace, `packages: ["packages/*", "apps/*"]`, supply-chain settings kept as they are                                                                                                                                                                                             |
| `packages/core` | ESM TypeScript, no runtime dependencies, compiled with `types: []` (no DOM, no Node)                                                                                                                                                                                                     |
| `apps/web`      | Vite 8 app; depends on `@<scope>/core` via `workspace:*`; Phaser 4 is its only runtime dependency besides core                                                                                                                                                                           |
| Root scripts    | `dev`, `build`, `test`, `test:coverage`, `lint`, `typecheck`, `format:check`, `check:quick`, `check:source`, `check`, `fix`, `budget`, `package:crazygames`, `test:e2e`, `e2e:browsers`, `agents:sync`, `agents:check`, `repo:labels`; template only: `bootstrap:e2e`, `bootstrap:check` |
| Node            | 24 for development and CI (unchanged); no published engines floor                                                                                                                                                                                                                        |
| Coverage floors | `packages/core` 95 %; `apps/web` 80 %, excluding `src/main.ts` and `src/scenes/**` (the e2e smoke covers them) and `src/platform/dom-loader.ts` (the untested default script loader)                                                                                                     |

### 3.2 Deterministic core and sample game

| Item            | Specification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PRNG            | 32-bit integer generator (operators `Math.imul`, `<<`, `>>>`, `>>`, `\|`, `&`, `^`, `+`, `-`, `\|0` only); one generator for the whole template                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Seed derivation | `seedFrom(text: string): number` — a 32-bit hash of UTF-16 code units                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Daily seed      | `dailySeed(dayUtc: "YYYY-MM-DD", salt: string)`; the day is computed in UTC by `apps/web`, never in core                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| API shape       | `createGame(seed, config) → State`, `applyMove(state, move) → State` (pure, no mutation), `isOver(state)`, `score(state)`, `replay(record) → { state, score }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| State           | plain JSON-serializable data (integers, arrays, strings); no classes, no `Map`, no floats                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Replay record   | `{ v: 1, seed: number, config: {...}, moves: Move[] }` — `v` is bumped whenever a rule change alters results                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Sample ruleset  | 5×5 board, 4 tile kinds; a move picks a cell and advances the kind of that cell and its orthogonal neighbours by one (mod 4); the board is solved when all cells share one kind; the move limit is 20; score = `moveLimit + 1 - movesUsed` (1–20) when solved, else 0, shown as `<score>/20`. Config `{ size: 5, kinds: 4, moveLimit: 20, scrambleMin: 6, scrambleMax: 10 }` (`SAMPLE_CONFIG`, carried in the replay record). The start board: from a uniform board of kind 0, draw `n = scrambleMin + nextInt(scrambleMax - scrambleMin + 1)`, then `n` cells with `nextInt(size*size)`, and apply each as a reverse move (kind minus one, mod 4); if the result is uniform, keep drawing one more reverse move until it is not, where `k` counts these retry draws (in practice `k` is 0); if `n + k` would exceed 20, the retry stops and the whole scramble is redrawn. Pressing the drawn cells forward solves it, so a solution within `n + k ≤ 20` moves always exists, the board is always solvable within the limit of 20, and the start board is never uniform |

The sample exists to show the pattern and is replaced by each game; its rules are not a
product decision.

### 3.3 Determinism guard

| Item           | Specification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint scope     | `packages/core/src/**`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Forbidden      | `Math.random`, `Date`, `performance`, `crypto`, `setTimeout`/`setInterval`, `Intl`, `window`, `document`, `globalThis`, `localeCompare` (banned through `no-restricted-syntax`), and the `Math` functions ECMA-262 §21.3.2 lets engines approximate (https://tc39.es/ecma262/multipage/numbers-and-dates.html, checked 2026-11-05: `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `sinh`, `cosh`, `tanh`, `asinh`, `acosh`, `atanh`, `exp`, `expm1`, `log`, `log1p`, `log2`, `log10`, `pow`, `cbrt`, `hypot`), and the `**` operator |
| Golden tests   | fixed seeds → exact board snapshot; fixed replay → exact state and score; `dailySeed("2026-11-05", "golden")` → fixed value (goldens use the literal salt `"golden"`). A changed golden value fails CI and needs a `v` bump once a release has shipped; a game that replaces the sample before its first release deletes the sample goldens and keeps `RULES_VERSION = 1`                                                                                                                                                                   |
| Property tests | for random seeds: `replay(record)` equals folding `applyMove`; `applyMove` never mutates its input                                                                                                                                                                                                                                                                                                                                                                                                                                          |

### 3.4 Web shell

| Item         | Specification                                                                                                                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine       | Phaser 4 (4.x latest that passes the 7-day release-age policy)                                                                                                                                       |
| Scenes       | Boot (load; `loadingStart` when its preload starts; retry on tap, Enter or Space), Title (`loadingStop` once, when it first becomes interactive), Play, Result — flows in `docs/product/ux-flows.md` |
| Startup      | `apps/web/src/main.ts` awaits `selectPlatform()` and `init()` with a 10 s timeout and fallback to `local`, then creates the `Phaser.Game`                                                            |
| Scaling      | `Scale.FIT`, centered, design size 720×1280 portrait; landscape shows side bars in the background colour                                                                                             |
| Input        | pointer (mouse and touch) and keyboard (arrow keys + Space/Enter to move a cursor and play)                                                                                                          |
| Rendering    | shapes and text only (no image assets in the sample); tile colour plus glyph                                                                                                                         |
| Ready signal | when the Title scene is interactive, set `document.body.dataset.ready = "true"` (used by the smoke test)                                                                                             |
| Play signal  | while Play accepts keys, `document.body.dataset.scene = "play"`; deleted when the board ends or Play shuts down (used by the smoke test)                                                             |
| Move mirror  | `#debug-moves` holds the integer move count as text; present in every build, `aria-hidden="true"`, visually hidden                                                                                   |
| Body CSS     | `user-select: none` with vendor prefixes, `touch-action: none` on the canvas                                                                                                                         |

### 3.5 Platform adapter

| Item         | Specification                                                                                                                                                                                                                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interface    | `Platform { init(): Promise<void>; loadingStart(); loadingStop(); gameplayStart(); gameplayStop(); happytime(); isMuted(): boolean; storage: KeyValueStore }`                                                                                                                                                   |
| Data flag    | `VITE_CRAZYGAMES_DATA=1` maps storage to `SDK.data` in the `crazygames` build (see Storage)                                                                                                                                                                                                                     |
| Selection    | `VITE_PLATFORM=local\|crazygames` at build time; `local` is the default for `pnpm dev`                                                                                                                                                                                                                          |
| `local`      | no-op events (logged with `console.debug` in dev only); storage = guarded `localStorage`                                                                                                                                                                                                                        |
| `crazygames` | loads `https://sdk.crazygames.com/crazygames-sdk-v3.js`, awaits `CrazyGames.SDK.init()`, forwards events to `SDK.game.*`, reads `SDK.game.settings.muteAudio`                                                                                                                                                   |
| Storage      | `KeyValueStore` = `getItem(key: string): string \| null`, `setItem(key: string, value: string): void`, `removeItem(key: string): void` (the `localStorage` API, never throws); with `VITE_CRAZYGAMES_DATA=1` the `crazygames` platform maps it to `SDK.data` (only when Progress Save is enabled at submission) |
| Failure      | if the SDK script fails to load, `init()` rejects or does not settle within 10 s, fall back to `local`, keep the game playable, show the player nothing and log one `console.warn`                                                                                                                              |
| Event rules  | `gameplayStart` each time a board becomes playable; `gameplayStop` on entering Result and on Back from Play, never twice in a row; leaving Result for Title sends nothing; never on tab blur (the portal handles it); `happytime` only when the Daily best increases                                            |

### 3.6 Daily mode

| Item       | Specification                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Day        | UTC date computed once, when Title first opens in the session; the board and the best key use it for the whole session, with no rollover past midnight                                                                                                                                                                                                                                |
| Board      | `createGame(dailySeed(day, "<game-slug>"), config)`                                                                                                                                                                                                                                                                                                                                   |
| Best score | Daily only; stored per day under `<game-slug>:best:<YYYY-MM-DD>` through `Platform.storage`; a score is a new best when `score > 0` and either no best is stored or `score >` the stored best; 0 is never stored; storage errors are swallowed and the game continues without saving                                                                                                  |
| Share text | Daily only. Three lines joined by `\n`, no trailing newline: `<GAME_TITLE> <YYYY-MM-DD>`; `<score>/20 · <movesUsed> moves` (unsolved: `0/20 · out of moves`); a 10-glyph bar of `floor(score / 2)` `▰` then `▱` (7 moves → `My Game 2026-11-05\n14/20 · 7 moves\n▰▰▰▰▰▰▰▱▱▱`). Copied with the Clipboard API, falling back to a text box that sets `user-select: text` on itself only |
| Practice   | a "Practice" board from a random seed (seed chosen in `apps/web`, then passed to core); no best, no `happytime`, no copy button                                                                                                                                                                                                                                                       |

### 3.7 Build, budget and portal package

| Item      | Specification                                                                                                                                                                                                                                                                                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base path | Vite `base: "./"` — CrazyGames loads files by relative path only (https://docs.crazygames.com/requirements/technical/, checked 2026-11-05)                                                                                                                                                                                                                              |
| Budget    | `pnpm budget [dir]` (default `apps/web/dist`): sum of the files ≤ 5,242,880 bytes (inclusive) (CrazyGames mobile homepage limit is 20 MB initial download; 5 MB leaves room for a game's assets) and ≤ 300 files (inclusive; portal limit 1500; both limits from https://docs.crazygames.com/requirements/technical/, checked 2026-11-05); the check fails the gate     |
| Zip       | `pnpm package:crazygames` builds with `VITE_PLATFORM=crazygames` into `.package/crazygames/`, runs the budget on that directory, then writes `.package/<slug>-<version>-crazygames.zip` with `index.html` at the zip root; `<slug>` is the root `package.json` `name`, `<version>` is `apps/web/package.json`'s; `apps/web/dist` (the local build) is never overwritten |
| Zip check | the zip contains `index.html` at its root, no absolute `src=`/`href=` URLs to the same origin, and no source maps                                                                                                                                                                                                                                                       |

### 3.8 Release workflow

| Item     | Specification                                                                                                                                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Trigger  | push of a tag `v*.*.*`                                                                                                                                                                                                                                             |
| Steps    | install with the frozen lockfile, run `pnpm check` once (it produces the zip through `package:crazygames`), then `gh release create "$TAG" .package/*.zip --generate-notes`; top-level `permissions` stay `{}` or `contents: read`, `contents: write` at job level |
| Not done | uploading to CrazyGames (manual, through its developer portal)                                                                                                                                                                                                     |

### 3.9 Boot smoke test

| Item       | Specification                                                                                                                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runner     | Playwright (Chromium) against `vite preview` of the `local` build on port 4173 with `strictPort: true`                                                                                          |
| Assertions | `body[data-ready="true"]` within 10 s; no `console.error`/`pageerror`; starting Practice, waiting for `body[data-scene="play"]`, and pressing Enter once changes `#debug-moves` from `0` to `1` |
| CI         | runs in the existing CI workflow as its own job                                                                                                                                                 |

### 3.10 Game bootstrap and agent harness

| Item                  | Specification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bootstrap prompts     | slug, display name (`--title`), author, GitHub user, license, one-line description — no email                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Bootstrap effects     | renames package names, `index.html` title, README, LICENSE, and the daily salt; keeps the sample; renames `GAME_SLUG`/`GAME_TITLE` in `apps/web/src/game-info.ts`; writes `.template-origin`; leaves `AGENTS.md`'s Product section as `TODO:` placeholders; removes itself and its tests (self-removal stays)                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Product section check | a test that fails in a generated repository while `AGENTS.md`'s Product section still contains `TODO:`; it reads `.template-origin` to tell a generated repository from the template, which is exempt. The placeholder is `## Product` followed by the four lines `TODO: What this game is, in one paragraph.`, `TODO: Who it is for, and the core interaction.`, `TODO: Non-goals, copied verbatim from docs/product/requirements.md.`, `TODO: Where decisions live: docs/product/requirements.md and the skills.`                                                                                                                                                                                                                                                                    |
| Bootstrap e2e         | `pnpm bootstrap:e2e` generates a repository and checks the renamed `GAME_SLUG`; `pnpm bootstrap:check` then expects `tests/product-section.test.ts` to fail, writes a fixture Product section, runs `pnpm check`, and asserts `.package/space-tiles-0.0.0-crazygames.zip` exists                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Skills shipped        | the skills under `.claude/skills/`: `starting-an-app`, `designing-ui`, `writing-game-core`, `building-scenes`, `integrating-portals`, `releasing-builds` (promoted from the stage 7 drafts by P120); `shipping-issues`, `triaging-issues`, `merge-dependabot`; and the process skills `tdd`, `create-pr`, `running-the-app`, `smart-commit` (ported from `tomada1114/intent-to-english` by P015). The conventions the other planned skills were to hold are rules under `.claude/rules/`, each loading when a file matching its `paths` frontmatter is read: `architecture.md`, `bootstrap.md` (template only), `dependencies.md`, `gates.md`, `guidance.md`, `scripts.md`, `tests.md`, `typescript.md`. Neither `codex-shipping-issues` nor `cloud-claude-shipping-issues` is shipped |
| Skills removed        | `public-api-contract`, `release-impact`, `type-testing` (npm package concerns)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## 4. Cross-cutting rules

- **Determinism boundary:** anything that reads time, randomness, the device or the
  network lives in `apps/web` and enters core as a plain value.
- **No network** except the portal SDK script and its calls.
- **Storage is optional:** every read and write goes through `Platform.storage`, which
  never throws.
- **Accessibility:** colour is never the only signal (each tile kind has a glyph); text
  contrast ≥ 4.5:1, tile and control contrast ≥ 3:1; every action reachable by keyboard.
- **First minute:** gameplay reachable in at most two taps from load; no blocking
  tutorial.

## 5. Data

| Entity | Fields                                                        | Where                                       | Kept                     |
| ------ | ------------------------------------------------------------- | ------------------------------------------- | ------------------------ |
| State  | `seed: int`, `cells: int[25]`, `movesUsed: int`, `limit: int` | memory                                      | session                  |
| Move   | `{ cell: int 0–24 }`                                          | memory, replay                              | session                  |
| Replay | `{ v: 1, seed, config, moves }`                               | memory (sent to a server later)             | session                  |
| Best   | `int 1–20` (Daily only; 0 never stored)                       | `Platform.storage`, key `<slug>:best:<day>` | until storage is cleared |

## 6. Open questions

- CrazyGames leaderboards / account features for a daily mode — settle at the game's
  kickoff.
- Whether a game relies on the CrazyGames data module (Progress Save) instead of
  `localStorage` — the docs require relying fully on it once enabled
  (https://docs.crazygames.com/sdk/data/, checked 2026-11-05); each game decides.

## 7. Decision log

- 2026-11-05 Template first, game later (rejected: kicking off the game directly,
  because its base rule is undecided and the hearing would stall on it).
- 2026-11-05 Phaser 4 for rendering (rejected: no engine — more hand-written feel and
  scaling work; PixiJS 8 — renderer only; Excalibur 0.32 — pre-1.0 API; KAPLAY —
  JS-first API). PixiJS 8.22, Excalibur 0.32 and KAPLAY versions per
  https://registry.npmjs.org/pixi.js, https://registry.npmjs.org/excalibur and
  https://registry.npmjs.org/kaplay (checked 2026-11-05).
- 2026-11-05 Cut from typescript-template and remove its npm machinery (rejected:
  keeping it dormant — gates that check nothing real).
- 2026-11-05 Port the agent harness layout of `tomada1114/intent-to-english` in an early
  issue; the repository is public and named `web-game-template`.
- 2026-11-05 Size budget 5 MB (rejected: 20 MB, the portal ceiling — a budget at the
  ceiling gives no warning).

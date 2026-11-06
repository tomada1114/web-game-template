---
name: building-scenes
description: >
  Use when writing or reviewing apps/web/src/main.ts or apps/web/src/scenes/**
  (BootScene, TitleScene, PlayScene, ResultScene): a Phaser 4 API such as Phaser.Game, a
  Scene, Scale.FIT, a tween, pointer or keyboard input; drawing the board from core
  State; the keyboard cursor and focus; scene transitions and start data; the Copy
  result fallback; document.body.dataset.ready or the #debug-moves mirror the e2e smoke
  test reads; a Phaser 3 API that no longer type-checks; or a scene that holds rule
  logic or mutates state.
---

# Building Scenes

**Owns:** the Phaser layer of `apps/web` — `apps/web/src/main.ts`, the scenes in
`apps/web/src/scenes/`, input, scaling, and the hooks the boot smoke test reads. **Does
not own:** the rules and the shape of `State` (`writing-game-core`); when a platform
event fires, storage, and the portal's page rules (`integrating-portals`); colour, type,
size, and motion values (`designing-ui`); where the smoke test lives and how it runs
(`placing-tests`).

Screens and the flow between them are in `docs/product/ux-flows.md`; app-wide input,
feedback, and error rules are in `docs/design/ux-guidelines.md`. Read both before
changing a scene. This skill holds the judgment they leave to the code.

## Scenes

- One `Phaser.Game`, created in `apps/web/src/main.ts` only after it has awaited
  `selectPlatform()` and `init()` (10 s timeout, fallback to local). One scene per file
  in `apps/web/src/scenes/`: `BootScene`, `TitleScene`, `PlayScene`, `ResultScene`.
- Boot loads assets behind a progress bar and, on a failed asset, shows a retry prompt.
  Title offers the daily board (primary, focused by default) and Practice. Play runs one
  board. Result offers Copy result (Daily only), Again (same seed), Practice (new seed),
  and Title. A Practice Result has no best line, no "New best!" and no Copy result.
- No `Platform` method is called before `init()` resolves.
- Platform events fire from these call sites: Boot's preload start (`loadingStart`),
  Title first becoming interactive (`loadingStop`, once), a board becoming playable in
  Play (`gameplayStart`), entering Result and Back from Play (`gameplayStop`, never
  twice in a row; Result → Title sends nothing), and Result on a new Daily best
  (`happytime`). When each one is allowed to fire: **REQUIRED:** `integrating-portals`.
- The daily day is taken in UTC once, when Title first opens in the session, and stays
  fixed for the session, even past midnight; the best key uses the same day. The
  Practice seed is picked here, in `apps/web`, with
  `crypto.getRandomValues(new Uint32Array(1))[0]`, and passed to core as an integer.
  Core never reads either. **BACKGROUND:** `writing-game-core`.
- Pass the seed, the mode, and the outcome to the next scene as plain start data. A
  module-level mutable "current game" outlives the scene that owns it and leaks one run
  into the next.
- Scene fade 150 ms; no transition longer than 300 ms. When the board ends, Play waits
  `layout.resultPauseMs` (300 ms) on the final board — a pause, not a transition — and
  then fades into Result.

## Rendering from state

- A scene keeps the current core `State` and the list of moves played; the replay record
  `{ v: RULES_VERSION, seed, config, moves }` is built from those two and nothing else.
- The board on screen is a function of `State`. A pure helper outside
  `apps/web/src/scenes/` (a `toView(state)`-style view model: kind, glyph, colour token
  per cell) does the mapping and carries the unit tests; the scene only draws what it
  returns.
- A scene never decides a rule. Neighbour logic, the solved check, and the score come
  from core (`applyMove`, `isOver`, `score`). A second copy of a rule in a scene drifts
  from the one a replay checks.
- On input: check that the cell is on the board and `!isOver(state)`, then
  `state = applyMove(state, move)`, push the move, redraw, and tween the changed tiles
  for 120 ms. The guard comes first because an invalid input does nothing visible;
  catching `ERR_INVALID_MOVE` as control flow hides real bugs.
- Never mutate `State`, even "just for the animation". Tween display objects, not state.
- Score and move count update in the same frame as the move.
- Shapes and text only; each tile kind is a colour plus a glyph (● ▲ ■ ◆). Every colour,
  size, radius, and duration comes from `apps/web/src/theme/tokens.ts`. **REQUIRED:**
  `designing-ui` for any value.
- Leaving and returning to the tab resumes the same board. Nothing resets, and no
  platform event fires, on a visibility change.

## Input

- Every action works by pointer (mouse and touch) and by keyboard. Pointer and keyboard
  feed the same `play(cell)` path, so the two can never disagree about a move.
- Title: Up/Down moves focus between the buttons; Enter/Space activates. Play: arrow
  keys move the cursor, Enter/Space plays the cell, Esc is Back. The cursor starts on
  the centre cell (12) and clamps at the edges; it does not wrap. Boot's retry accepts a
  tap, Enter or Space. Result's focus order is Copy result (Daily only), Again,
  Practice, Title.
- Tap targets are at least `layout.tapMin` (88×88) design pixels. No drag, long-press,
  double-tap, or hover-only affordance; a game that adds one adds a keyboard path in the
  same change.
- Focus is visible whenever the keyboard is in use: a `layout.focusRing` (2 px) ring in
  `accent`, drawn `layout.focusOffset` (4 px) outside the tile or button, in the gap on
  `surface`, never against the tile's edge. **BACKGROUND:** `designing-ui`.
- Invalid input — outside the board, after the board ended — does nothing visible. No
  error sound, no shake.

## Scale

- `Phaser.Scale.FIT`, `autoCenter: CENTER_BOTH`, design size 720×1280 portrait, page and
  canvas background `bg`. In landscape the canvas centres with `bg` side bars.
- Lay everything out in design pixels. Reading the window size to place an object breaks
  the moment the portal resizes its iframe.
- The page-level rules — `user-select: none` on `body`, `touch-action: none` on the
  canvas, safe areas — come from the portal's requirements. **REQUIRED:**
  `integrating-portals`.

## Test hooks

- `document.body.dataset.ready = "true"` is set when Title accepts input — not when Boot
  ends, and not before the first frame Title can be clicked.
- `#debug-moves` holds the integer move count as text. It is present in every build,
  `aria-hidden="true"` and visually hidden. Update it in the same place the on-canvas
  counter is updated, so the two cannot drift.
- The boot smoke test (`tests/e2e/`, Playwright on Chromium against `vite preview` of
  the local build in `apps/web/dist`, port `E2E_PORT` (default 4173),
  `strictPort: true`) waits for `body[data-ready="true"]` within 10 s, fails on any
  `console.error` or page error, then starts Practice, presses Enter once, and expects
  `#debug-moves` to go from 0 to 1. Keep that path working when Title or Play changes,
  or change the test in the same PR. An expected, handled failure logs `console.warn`,
  never `console.error`.
- `apps/web/src/main.ts` and `apps/web/src/scenes/**` have no unit coverage floor; the
  smoke test covers them. (`apps/web/src/platform/dom-loader.ts` is the third exclusion;
  `integrating-portals` owns it.) Logic worth testing moves into a pure helper outside
  `apps/web/src/scenes/`, where the `apps/web` floor applies. Enforced by:
  `vitest.config.ts` `coverage.thresholds`.
- Copy result uses the Clipboard API. When that fails, show the text in a DOM text box
  the player can select; that element sets `user-select: text` itself, since `body`
  disables selection.

## Phaser 4 APIs

- The game depends on `phaser@^4`: 4.0.0 was released 2026-04-10 and 4.2.1 on 2026-07-09
  (https://registry.npmjs.org/phaser, checked 2026-11-05). Adding or bumping it follows
  the release-age policy. **REQUIRED:** `managing-dependencies`.
- Phaser 4 is a new major version, and habits — an agent's included — lean on Phaser 3
  APIs. Before using a Phaser API, look it up in the current documentation: a
  documentation lookup tool such as context7 where available, else
  https://docs.phaser.io/.
- A type error on a Phaser call is the usual first sign of a Phaser 3 habit. Look the
  API up; do not cast the error away.
- Keep Phaser out of `packages/core`. Core stays engine-free so the renderer can be
  replaced without touching a rule.

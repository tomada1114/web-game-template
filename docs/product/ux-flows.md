# Web Game Template — UX flows (sample game)

Screens of the sample game the template ships. Each game replaces them; they exist so a
generated repository shows the scene pattern, the platform events, and the first-minute
rule working end to end. App-wide UX policy is in `docs/design/ux-guidelines.md`.

Design size 720×1280 (portrait), `Scale.FIT`. In landscape the canvas is centered with
the background colour on both sides.

## Flow

```
            ┌──────────┐  assets ready   ┌──────────┐
  load ───▶ │   Boot   │ ──────────────▶ │  Title   │ ◀───────────────┐
            └──────────┘ loadingStart →  └──────────┘                 │
                         loadingStop       │ Daily     │ Practice     │
                                           ▼           ▼              │
                                      ┌─────────────────────┐         │
                                      │        Play         │         │
                                      │ gameplayStart       │         │
                                      └─────────────────────┘         │
                              solved or limit reached │  Back (Esc)   │
                                      ▼               └──── gameplayStop
                                 ┌──────────┐                         │
                                 │  Result  │ gameplayStop            │
                                 │ happytime│ (new Daily best only)   │
                                 └──────────┘                         │
                                   │ Again (same board) ─▶ Play       │
                                   │ Practice ─────────▶ Play (new seed)
                                   └ Title ───────────────────────────┘
```

Before any scene: `apps/web/src/main.ts` awaits `selectPlatform()` and `init()` with a
10 s timeout (on failure or timeout it falls back to local, shows the player nothing and
logs one `console.warn`), and only then creates the `Phaser.Game`.

Events: `loadingStart` when Boot's preload starts; `loadingStop` once, when Title first
becomes interactive; `gameplayStart` each time a board becomes playable (Daily,
Practice, Again); `gameplayStop` on entering Result and on Back from Play, never twice
in a row. Leaving Result for Title sends nothing. Never on tab blur — the portal handles
that.

## Boot

```
┌───────────────────────────┐
│                           │
│                           │
│        GAME NAME          │
│        ▓▓▓▓▓▓░░░░         │  progress bar, 0–100 %
│                           │
│                           │
└───────────────────────────┘
```

- Empty/loading: progress bar only. The sample has no image assets, so Boot normally
  lasts under one frame; the bar exists for games that add assets.
- Error: if a required asset fails, show "Couldn't load. Tap to retry." and retry the
  loader on a tap, Enter or Space.

## Title

```
┌───────────────────────────┐
│        GAME NAME          │
│   Daily · 2026-11-05      │  UTC day
│   Best today: 14          │  hidden when none / storage unavailable
│                           │
│   ┌───────────────────┐   │
│   │   Play daily      │   │  primary, focused by default (Enter)
│   └───────────────────┘   │
│   ┌───────────────────┐   │
│   │   Practice        │   │  secondary
│   └───────────────────┘   │
│                           │
│   One line of how to play │
└───────────────────────────┘
```

- `document.body.dataset.ready = "true"` is set when this scene accepts input.
- The UTC day is computed once, when Title first opens in the session, and stays fixed
  for the session (no rollover past midnight); the best line and key use that day.
- Keyboard: Up/Down moves focus between the two buttons, Enter/Space activates.

## Play

```
┌───────────────────────────┐
│ ← Back      Moves 3 / 20  │  Back = Esc
│                           │
│   ● ▲ ■ ◆ ●               │
│   ▲ ▲ ■ ● ◆               │  5×5 tiles, colour + glyph
│   ■ ● [◆] ▲ ■             │  [ ] = keyboard cursor
│   ◆ ■ ▲ ● ▲               │
│   ● ◆ ■ ▲ ●               │
│                           │
│  Make every tile the same │
└───────────────────────────┘
```

- Tap/click a tile, or move the cursor with arrow keys and press Enter/Space: the tile
  and its orthogonal neighbours advance one kind; a 120 ms tween shows the change.
- The move count is mirrored as an integer in text into `#debug-moves`, present in every
  build, `aria-hidden="true"` and visually hidden, so the smoke test can read it;
  `body[data-scene="play"]` marks that Play accepts keys.
- Board solved or move limit reached → Result after a 300 ms pause.

## Result

```
┌───────────────────────────┐
│        Solved! / Out of moves
│        Score 14/20        │
│        New best!          │  Daily only, when the stored best increased
│                           │
│   ┌───────────────────┐   │
│   │   Copy result     │   │  Daily only; share text to clipboard
│   └───────────────────┘   │
│   Again    Practice   Title
└───────────────────────────┘
```

- Copy result: Clipboard API; on failure, show the text in a selectable box.
- "Again" replays the same seed; "Practice" starts a new random seed.
- Score: `moveLimit + 1 - movesUsed` (1–20) when solved, 0 when out of moves.
- Practice Result shows the score with Again, Practice and Title only: no best line, no
  "New best!", no Copy result, no `happytime`.
- Keyboard focus order: Copy result (Daily only), Again, Practice, Title.
- Choosing Title sends no platform event.

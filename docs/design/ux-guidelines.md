# Web Game Template — UX guidelines

App-wide UX rules every game cut from the template starts with. Screens are in
`docs/product/ux-flows.md`; colours and type are in `docs/design/design-direction.md`
and the `designing-ui` skill.

## First minute

- Gameplay is reachable in at most two taps from load (Title → Play).
- No blocking tutorial or modal. One line of instruction on Title and one on Play.
- Load to interactive Title in under 10 seconds on a mid-range phone (the template's own
  target).

## Input

- Every action works with pointer (mouse and touch) and with the keyboard.
- Tap targets are at least 88×88 design pixels (`layout.tapMin`) (44 CSS px at the
  720-wide design size scaled to a 360-px-wide phone).
- No drag, long-press, double-tap, or hover-only affordance in the template; a game that
  adds one also adds a keyboard path.
- `user-select: none` on `body`; `touch-action: none` on the canvas.

## Feedback

- A valid move animates within one frame: 120 ms tween, ease-out.
- An invalid input (outside the board, after the game ended) does nothing visible; no
  error sound or shake in the template.
- Score and move counts update in the same frame as the move.
- Transitions between scenes: 150 ms fade; never longer than 300 ms.
- A finished board waits 300 ms (`layout.resultPauseMs`) before Result. That is a pause
  on the final board, not a transition; the fade into Result stays 150 ms.

## State and errors

- Storage may be unavailable (private mode, blocked iframe storage). The game never
  shows an error for it; it hides "Best" and keeps playing.
- The portal SDK may fail to load or `init()` may not settle within 10 s. The game falls
  back to the local platform, shows the player nothing, and logs one `console.warn`.
- Leaving and returning to the tab resumes the same board; nothing is reset by
  visibility changes.

## Audio

- The template has no sound. A game that adds sound honours the portal mute setting
  (CrazyGames `SDK.game.settings.muteAudio`, https://docs.crazygames.com/sdk/game/,
  checked 2026-11-05) over its own toggle, and resumes a suspended `AudioContext` inside
  a user gesture (iOS; https://docs.crazygames.com/requirements/technical/, checked
  2026-11-05).

## Accessibility

- Colour is never the only signal: each tile kind has a glyph.
- Text contrast ≥ 4.5:1 against its background; tiles and controls ≥ 3:1.
- Focus is always visible when the keyboard is used: a 2 px accent ring drawn 4 px
  outside the tile or button, on `surface` (accent/surface 6.82:1).

## Copy

- English, sentence case, short verbs ("Play daily", "Copy result").
- Numbers as digits; dates as `YYYY-MM-DD` (UTC).

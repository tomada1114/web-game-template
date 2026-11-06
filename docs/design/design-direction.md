# Web Game Template — Design direction (sample)

Scope: the template's sample game only. A game cut from the template runs its own design
stage at its kickoff and replaces these values; the binding format is the `designing-ui`
skill's lock and `apps/web/src/theme/tokens.ts`.

## Direction

- **Primary reference:** a quiet, high-contrast board-game look — dark background, flat
  tiles, no gradients, no textures, no image assets.
- **Preserved:** legibility of the board at phone size; colour-blind safety.
- **Borrowed:** the Okabe–Ito colour-blind-safe palette for tile kinds (Okabe & Ito,
  "Color Universal Design", 2008, https://jfly.uni-koeln.de/color/, checked 2026-11-05),
  each paired with a glyph. `tile1` is darkened from Okabe–Ito sky blue to `#2F8FD8` so
  its glyph keeps 4.5:1.
- **One theme:** dark only. Games are full-screen canvases inside portal pages; the
  template does not follow the system colour scheme.

## Role rules

- `bg` is the canvas and page background; `surface` holds the board and buttons.
- `text` for all labels; `textMuted` only for secondary lines (date, instructions).
- `accent` for the primary button fill, the keyboard focus ring, and "New best". It is
  not a tile colour.
- The keyboard focus ring is a `focusRing` (2 px) accent ring drawn `focusOffset` (4 px)
  outside the focused tile or button, in the gap, so it sits on `surface`.
- Tile colours are used only for tiles, never for UI chrome.

## Tokens

| Token                  | Value                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `bg`                   | `#15171C`                                                                                          |
| `surface`              | `#1F232B`                                                                                          |
| `text`                 | `#F2F3F5`                                                                                          |
| `textMuted`            | `#A9AFBA`                                                                                          |
| `accent`               | `#56B4E9`                                                                                          |
| `onAccent`             | `#15171C`                                                                                          |
| `tile0` (glyph ●)      | `#E69F00`                                                                                          |
| `tile1` (glyph ▲)      | `#2F8FD8`                                                                                          |
| `tile2` (glyph ■)      | `#009E73`                                                                                          |
| `tile3` (glyph ◆)      | `#CC79A7`                                                                                          |
| `glyphOnTile`          | `#15171C`                                                                                          |
| Font                   | system UI stack: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`                        |
| Type scale (design px) | title 64, heading 40, body 28, caption 22                                                          |
| Radius                 | tile 12, button 16                                                                                 |
| Spacing unit           | 8 design px                                                                                        |
| Motion                 | move tween 120 ms ease-out; scene fade 150 ms; pause before Result 300 ms (`layout.resultPauseMs`) |

Layout tokens (`layout`, design px unless noted):

| Token           | Value |
| --------------- | ----- |
| `designWidth`   | 720   |
| `designHeight`  | 1280  |
| `tapMin`        | 88    |
| `focusRing`     | 2     |
| `focusOffset`   | 4     |
| `tileSize`      | 112   |
| `tileGap`       | 16    |
| `resultPauseMs` | 300   |

## Contrast (measured 2026-11-05, WCAG 2.2 relative luminance; SC 1.4.3 and 1.4.11, https://www.w3.org/TR/WCAG22/, checked 2026-11-05)

| Pair                             | Ratio                     | Needed | Result |
| -------------------------------- | ------------------------- | ------ | ------ |
| text / bg                        | 16.15                     | 4.5    | pass   |
| text / surface                   | 14.18                     | 4.5    | pass   |
| textMuted / bg                   | 8.14                      | 4.5    | pass   |
| textMuted / surface              | 7.14                      | 4.5    | pass   |
| accent / bg (control)            | 7.77                      | 3.0    | pass   |
| accent / surface (focus ring)    | 6.82                      | 3.0    | pass   |
| onAccent / accent (button label) | 7.77                      | 4.5    | pass   |
| tile0 / surface                  | 6.99                      | 3.0    | pass   |
| tile1 / surface                  | 4.53                      | 3.0    | pass   |
| tile1 / bg                       | 5.16                      | 3.0    | pass   |
| tile2 / surface                  | 4.60                      | 3.0    | pass   |
| tile3 / surface                  | 5.14                      | 3.0    | pass   |
| glyphOnTile / tile0–3            | 7.96 / 5.16 / 5.24 / 5.86 | 4.5    | pass   |

`tile1` (`#2F8FD8`) is distinct from `accent` (`#56B4E9`), so no tile shares a colour
with UI chrome.

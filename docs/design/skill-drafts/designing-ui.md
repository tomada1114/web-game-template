---
name: designing-ui
description: >
  Use when choosing or changing a colour, font, type size, radius, spacing, or motion
  value; editing apps/web/src/theme/tokens.ts; finding a colour or size literal
  elsewhere in apps/web; checking text, tile, control, or focus-outline contrast (4.5:1,
  3:1); changing the tile palette or glyphs; or running a game's own visual design stage
  that replaces the sample's design lock in references/design-lock.md and
  docs/design/design-direction.md.
---

# Designing UI

**Owns:** the visual design lock, `apps/web/src/theme/tokens.ts`, and the contrast rule.
**Does not own:** screens, flows, and where things sit on them
(`docs/product/ux-flows.md`, drawn by `building-scenes`); how a scene consumes a token
(`building-scenes`); the portal's page rules (`integrating-portals`).

## The lock

- [references/design-lock.md](references/design-lock.md) is binding: direction, role
  rules, token table, contrast table. `apps/web/src/theme/tokens.ts` holds the same
  values as code. When the two disagree, that is a bug to fix in one change, not a
  choice between them. `docs/design/design-direction.md` is the record the lock was
  written from.
- The shipped lock describes the sample game. A game replaces it in its own design stage
  — direction, role rules, tokens, and a re-measured contrast table — in one change
  together with `tokens.ts` and `docs/design/design-direction.md`.
- Changing a value inside the direction is an edit. Changing the direction itself (a
  light theme, textures, image tiles) is a new design stage, not an edit.
- The role rules are what review catches most: tile colours never appear in UI chrome;
  `accent` is only the primary button fill, the keyboard focus ring, and "New best", and
  is not a tile colour; `textMuted` is only for secondary lines.
- One theme. Games run as full-screen canvases inside portal pages, so the lock does not
  follow the system colour scheme.

## Tokens

- `apps/web/src/theme/tokens.ts` exports `colors`, `type`, `radius`, `space`, `motion`,
  and `layout` as `as const` objects. `layout` holds `designWidth` 720, `designHeight`
  1280, `tapMin` 88, `focusRing` 2, `focusOffset` 4, `tileSize` 112, `tileGap` 16, and
  `resultPauseMs` 300. Each colour exists twice from one source: a `0xRRGGBB` number for
  Phaser and a `css` string for the DOM, so the canvas and the DOM elements (the Copy
  result fallback, the page background) cannot drift.
- Nothing else in `apps/web` writes a colour or size literal. A size that is not yet a
  token is added to `layout` in `tokens.ts`, not written inline.
- No lint rule enforces this. A reviewer looks for `0x`, `#`, and bare numeric sizes or
  durations outside `tokens.ts` in the diff.
- Sizes are design pixels of the 720×1280 frame; spacing is a multiple of the 8 px unit.

## Contrast

- Text is at least 4.5:1 against its background; tiles, controls, and the focus outline
  are at least 3:1. Colour is never the only signal: each tile kind has a glyph.
- Ratios are WCAG 2.2 relative-luminance contrast (SC 1.4.3 and 1.4.11,
  https://www.w3.org/TR/WCAG22/, checked 2026-11-05). Changing any colour re-runs every
  row of the contrast table in the lock, and the new ratios land in the same change. A
  failing pair is not merged. `docs/design/contrast-pairs.json` lists every pair with
  its threshold, and a test recomputes each from `tokens.ts` and fails below it.
- Measure pairs as they are drawn. A new element on a new background adds a row; a row
  for a pair that no longer appears is removed.
- The focus ring is the pair most easily missed. `accent` against the tile colours is
  low, so the ring is 2 px drawn 4 px outside the tile, in the gap on `surface`; against
  `surface`, `accent` measures 6.82.
- The colour-blind-safe tile palette and its glyphs are chosen together. Swapping a tile
  colour re-checks both its contrast row and that the four kinds stay distinguishable
  without colour.

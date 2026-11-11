/**
 * The design tokens: the only place in `apps/web` that writes a colour, size,
 * radius, spacing, or duration. Values come from
 * `docs/design/design-direction.md` § Tokens.
 */

function color<const Hex extends number, const Css extends string>(hex: Hex, css: Css) {
  return { hex, css } as const;
}

/** Each colour as a `0xRRGGBB` number for Phaser and a `css` string for the DOM. */
export const colors = {
  bg: color(0x15171c, "#15171C"),
  surface: color(0x1f232b, "#1F232B"),
  text: color(0xf2f3f5, "#F2F3F5"),
  textMuted: color(0xa9afba, "#A9AFBA"),
  accent: color(0x56b4e9, "#56B4E9"),
  onAccent: color(0x15171c, "#15171C"),
  tile0: color(0xe69f00, "#E69F00"),
  tile1: color(0x2f8fd8, "#2F8FD8"),
  tile2: color(0x009e73, "#009E73"),
  tile3: color(0xcc79a7, "#CC79A7"),
  glyphOnTile: color(0x15171c, "#15171C"),
} as const;

/** The font stack and the type scale, in design pixels. */
export const type = {
  font: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  title: 64,
  heading: 40,
  body: 28,
  caption: 22,
} as const;

/** Corner radii, in design pixels. */
export const radius = {
  tile: 12,
  button: 16,
} as const;

/** The spacing unit, in design pixels; every gap is a multiple of it. */
export const space = {
  unit: 8,
} as const;

/** Durations in milliseconds, and the move tween's easing. */
export const motion = {
  moveMs: 120,
  moveEase: "Cubic.easeOut",
  sceneFadeMs: 150,
} as const;

/** Layout sizes, in design pixels of the 720×1280 frame unless noted. */
export const layout = {
  designWidth: 720,
  designHeight: 1280,
  tapMin: 88,
  focusRing: 2,
  focusOffset: 4,
  tileSize: 112,
  tileGap: 16,
  /** Milliseconds on the final board before Result: a pause, not a transition. */
  resultPauseMs: 300,
  buttonWidth: 320,
  /** Width of Result's three buttons in one row. */
  rowButtonWidth: 176,
  progressWidth: 400,
  progressHeight: 16,
  /** Pop scale a changed tile reaches mid-tween. */
  movePopScale: 1.08,
} as const;

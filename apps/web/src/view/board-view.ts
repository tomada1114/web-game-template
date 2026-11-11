import { SAMPLE_CONFIG, isOver, score, type State } from "@my-game/core";

import { colors, layout } from "../theme/tokens.js";

/** The glyph and colour that show one tile kind; colour is never the only signal. */
export interface TileStyle {
  readonly glyph: string;
  /** The tile's fill as a `0xRRGGBB` number. */
  readonly fill: number;
}

const TILE_STYLES: readonly TileStyle[] = [
  { glyph: "●", fill: colors.tile0.hex },
  { glyph: "▲", fill: colors.tile1.hex },
  { glyph: "■", fill: colors.tile2.hex },
  { glyph: "◆", fill: colors.tile3.hex },
];

/**
 * Returns the glyph and colour of a tile kind.
 *
 * @throws RangeError when `kind` is not a kind the sample game has.
 */
export function tileStyle(kind: number): TileStyle {
  const style = TILE_STYLES[kind];
  if (style === undefined) {
    throw new RangeError(
      `kind must be an integer from 0 to ${String(TILE_STYLES.length - 1)}.`,
    );
  }
  return style;
}

const SIDE = SAMPLE_CONFIG.size;
const PITCH = layout.tileSize + layout.tileGap;
const BOARD_EXTENT = SIDE * layout.tileSize + (SIDE - 1) * layout.tileGap;

/** The design-pixel rectangle the board occupies, centred in the frame. */
export const boardRect = {
  x: (layout.designWidth - BOARD_EXTENT) / 2,
  y: (layout.designHeight - BOARD_EXTENT) / 2,
  width: BOARD_EXTENT,
  height: BOARD_EXTENT,
} as const;

/** The cell the keyboard cursor starts on: the centre of the board. */
export const CURSOR_START = Math.floor((SIDE * SIDE) / 2);

/** The design-pixel centre of a cell, row by row from the top left. */
export function cellCenter(cell: number): { readonly x: number; readonly y: number } {
  const column = cell % SIDE;
  const row = Math.floor(cell / SIDE);
  return {
    x: boardRect.x + column * PITCH + layout.tileSize / 2,
    y: boardRect.y + row * PITCH + layout.tileSize / 2,
  };
}

/** One cell as the scene draws it. */
export interface CellView extends TileStyle {
  readonly cell: number;
  readonly kind: number;
  readonly x: number;
  readonly y: number;
}

/** Everything Play draws, derived from a core `State` and nothing else. */
export interface BoardView {
  readonly cells: readonly CellView[];
  readonly movesUsed: number;
  readonly movesLabel: string;
  /** Whether the board accepts no further move. */
  readonly over: boolean;
}

/** Maps a core state to what Play draws; never mutates `state`. */
export function toView(state: State): BoardView {
  return {
    cells: state.cells.map((kind, cell) => ({
      cell,
      kind,
      ...tileStyle(kind),
      ...cellCenter(cell),
    })),
    movesUsed: state.movesUsed,
    movesLabel: `Moves ${String(state.movesUsed)} / ${String(state.limit)}`,
    over: isOver(state),
  };
}

/** Result's headline and score line for a finished state. */
export function resultLines(state: State): {
  readonly headline: string;
  readonly score: string;
} {
  const points = score(state);
  return {
    headline: points > 0 ? "Solved!" : "Out of moves",
    score: `Score ${String(points)}/${String(state.limit)}`,
  };
}

/** An arrow-key direction. */
export type Direction = "up" | "down" | "left" | "right";

/** Moves the cursor one cell; at an edge it stays where it is (no wrap). */
export function moveCursor(cell: number, direction: Direction): number {
  const column = cell % SIDE;
  const row = Math.floor(cell / SIDE);
  switch (direction) {
    case "up":
      return row > 0 ? cell - SIDE : cell;
    case "down":
      return row < SIDE - 1 ? cell + SIDE : cell;
    case "left":
      return column > 0 ? cell - 1 : cell;
    case "right":
      return column < SIDE - 1 ? cell + 1 : cell;
  }
}

/** Moves focus within a list of `count` controls, clamping at both ends. */
export function moveFocus(index: number, delta: number, count: number): number {
  return Math.min(Math.max(index + delta, 0), count - 1);
}

/**
 * The rectangle of the focus ring around a control centred at `x`, `y`: drawn
 * `layout.focusOffset` outside it, so it sits in the gap on `surface`.
 */
export function focusRect(
  x: number,
  y: number,
  width: number,
  height: number,
): {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
} {
  const grow = layout.focusOffset + layout.focusRing / 2;
  return {
    x: x - width / 2 - grow,
    y: y - height / 2 - grow,
    width: width + grow * 2,
    height: height + grow * 2,
  };
}

/** Splits a `0xRRGGBB` colour into the 0–255 channels Phaser's camera fade takes. */
export function channels(hex: number): readonly [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

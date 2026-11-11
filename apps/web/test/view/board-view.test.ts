import { SAMPLE_CONFIG, applyMove, createGame, type State } from "@my-game/core";
import { describe, expect, it } from "vitest";

import { colors, layout } from "../../src/theme/tokens.js";
import {
  CURSOR_START,
  boardRect,
  cellCenter,
  channels,
  focusRect,
  moveCursor,
  moveFocus,
  resultLines,
  tileStyle,
  toView,
} from "../../src/view/board-view.js";

function stateOf(cells: readonly number[], movesUsed = 0): State {
  return { seed: 1, cells, movesUsed, limit: 20 };
}

describe("tileStyle", () => {
  it("maps kinds 0-3 to a glyph and the tile colours", () => {
    expect([0, 1, 2, 3].map(tileStyle)).toEqual([
      { glyph: "●", fill: 0xe69f00 },
      { glyph: "▲", fill: 0x2f8fd8 },
      { glyph: "■", fill: 0x009e73 },
      { glyph: "◆", fill: 0xcc79a7 },
    ]);
  });

  it.each([-1, 4, 1.5, Number.MAX_SAFE_INTEGER])("rejects kind %s", (kind) => {
    expect(() => tileStyle(kind)).toThrow(RangeError);
  });
});

describe("cellCenter", () => {
  it("centres the 5x5 board in the 720x1280 frame", () => {
    expect(boardRect).toEqual({ x: 48, y: 328, width: 624, height: 624 });
    expect(cellCenter(0)).toEqual({ x: 104, y: 384 });
    expect(cellCenter(12)).toEqual({ x: 360, y: 640 });
    expect(cellCenter(24)).toEqual({ x: 616, y: 896 });
  });
});

describe("toView", () => {
  it("describes every cell with its kind, glyph, colour and position", () => {
    const state = createGame(42, SAMPLE_CONFIG);
    const view = toView(state);
    expect(view.cells).toHaveLength(25);
    view.cells.forEach((cell, index) => {
      expect(cell.cell).toBe(index);
      expect(cell.kind).toBe(state.cells[index]);
      expect({ glyph: cell.glyph, fill: cell.fill }).toEqual(tileStyle(cell.kind));
      expect({ x: cell.x, y: cell.y }).toEqual(cellCenter(index));
    });
    expect(view.movesUsed).toBe(0);
    expect(view.movesLabel).toBe("Moves 0 / 20");
    expect(view.over).toBe(false);
  });

  it("advances the pressed cell and its neighbours after a move on cell 12", () => {
    const start = stateOf(Array.from({ length: 25 }, () => 0));
    const before = { ...start, cells: start.cells.map((_, i) => (i === 0 ? 1 : 0)) };
    const after = applyMove(before, { cell: 12 });
    const view = toView(after);
    const changed = view.cells.filter((cell) => cell.kind !== before.cells[cell.cell]);
    expect(changed.map((cell) => cell.cell)).toEqual([7, 11, 12, 13, 17]);
    expect(changed.every((cell) => cell.glyph === "▲")).toBe(true);
    expect(view.movesLabel).toBe("Moves 1 / 20");
    expect(view.movesUsed).toBe(1);
  });

  it("does not mutate the state", () => {
    const state = createGame(7, SAMPLE_CONFIG);
    const copy = structuredClone(state);
    toView(state);
    expect(state).toEqual(copy);
  });

  it("marks a solved board and a board at the move limit as over", () => {
    expect(
      toView(
        stateOf(
          Array.from({ length: 25 }, () => 2),
          7,
        ),
      ).over,
    ).toBe(true);
    const unsolved = Array.from({ length: 25 }, (_, i) => (i === 0 ? 1 : 0));
    expect(toView(stateOf(unsolved, 20)).over).toBe(true);
    expect(toView(stateOf(unsolved, 19)).over).toBe(false);
  });
});

describe("resultLines", () => {
  it("reports a board solved on move 7 as Score 14/20", () => {
    expect(
      resultLines(
        stateOf(
          Array.from({ length: 25 }, () => 3),
          7,
        ),
      ),
    ).toEqual({
      headline: "Solved!",
      score: "Score 14/20",
    });
  });

  it("reports the 20th move without a solve as out of moves with score 0", () => {
    const cells = Array.from({ length: 25 }, (_, i) => (i === 0 ? 1 : 0));
    expect(resultLines(stateOf(cells, 20))).toEqual({
      headline: "Out of moves",
      score: "Score 0/20",
    });
  });
});

describe("moveCursor", () => {
  it("starts on the centre cell", () => {
    expect(CURSOR_START).toBe(12);
  });

  it("moves one cell in each direction", () => {
    expect(moveCursor(12, "up")).toBe(7);
    expect(moveCursor(12, "down")).toBe(17);
    expect(moveCursor(12, "left")).toBe(11);
    expect(moveCursor(12, "right")).toBe(13);
    expect(moveCursor(4, "down")).toBe(9);
  });

  it("clamps at every edge without wrapping", () => {
    expect(moveCursor(4, "right")).toBe(4);
    expect(moveCursor(4, "up")).toBe(4);
    expect(moveCursor(0, "left")).toBe(0);
    expect(moveCursor(0, "up")).toBe(0);
    expect(moveCursor(20, "down")).toBe(20);
    expect(moveCursor(24, "right")).toBe(24);
    expect(moveCursor(24, "down")).toBe(24);
    expect(moveCursor(5, "left")).toBe(5);
    expect(moveCursor(9, "right")).toBe(9);
  });
});

describe("moveFocus", () => {
  it("moves through Again, Practice, Title and clamps at both ends", () => {
    expect(moveFocus(0, 1, 3)).toBe(1);
    expect(moveFocus(2, 1, 3)).toBe(2);
    expect(moveFocus(0, -1, 3)).toBe(0);
    expect(moveFocus(0, 1, 1)).toBe(0);
  });
});

describe("focusRect", () => {
  it("puts a 2 px ring 4 px outside the control", () => {
    expect(layout.focusRing).toBe(2);
    expect(layout.focusOffset).toBe(4);
    // The stroke is centred on the path: 4 px gap plus half the 2 px ring.
    expect(focusRect(100, 200, 112, 112)).toEqual({
      x: 39,
      y: 139,
      width: 122,
      height: 122,
    });
  });
});

describe("channels", () => {
  it("splits bg into its RGB channels", () => {
    expect(channels(colors.bg.hex)).toEqual([0x15, 0x17, 0x1c]);
    expect(channels(0xffffff)).toEqual([255, 255, 255]);
    expect(channels(0)).toEqual([0, 0, 0]);
  });
});

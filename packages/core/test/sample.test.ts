import { describe, expect, it } from "vitest";

import {
  InvalidMoveError,
  SAMPLE_CONFIG,
  applyMove,
  createGame,
  createPrng,
  isOver,
  score,
  type Config,
  type State,
} from "../src/index.js";

import { thrownBy } from "./thrown-by.js";

function stateOf(cells: readonly number[], movesUsed = 0): State {
  return { seed: 0, cells, movesUsed, limit: 20 };
}

function changedCells(before: State, after: State): number[] {
  return before.cells.flatMap((kind, index) =>
    kind === after.cells[index] ? [] : [index],
  );
}

// Every kind sits next to every other one, so no move on it is hidden by a
// neighbour of the same kind.
// prettier-ignore
const MIXED = [
  0, 1, 2, 3, 0,
  1, 2, 3, 0, 1,
  2, 3, 0, 1, 2,
  3, 0, 1, 2, 3,
  0, 1, 2, 3, 0,
];

// One press of the centre away from a board of kind 0.
// prettier-ignore
const ONE_FROM_SOLVED = [
  0, 0, 0, 0, 0,
  0, 0, 3, 0, 0,
  0, 3, 3, 3, 0,
  0, 0, 3, 0, 0,
  0, 0, 0, 0, 0,
];

const SOLVED = Array.from({ length: 25 }, () => 2);

describe("SAMPLE_CONFIG", () => {
  it("holds the sample ruleset's parameters", () => {
    expect(SAMPLE_CONFIG).toStrictEqual({
      size: 5,
      kinds: 4,
      moveLimit: 20,
      scrambleMin: 6,
      scrambleMax: 10,
    });
  });
});

describe("applyMove", () => {
  it("advances the centre cell and its four neighbours by one", () => {
    // prettier-ignore
    const before = stateOf([
      1, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
    ]);

    const after = applyMove(before, { cell: 12 });

    // prettier-ignore
    expect(after).toStrictEqual({
      seed: 0,
      cells: [
        1, 0, 0, 0, 0,
        0, 0, 1, 0, 0,
        0, 1, 1, 1, 0,
        0, 0, 1, 0, 0,
        0, 0, 0, 0, 0,
      ],
      movesUsed: 1,
      limit: 20,
    });
  });

  it.each([
    ["the first corner", 0, [0, 1, 5]],
    ["the top edge", 2, [1, 2, 3, 7]],
    ["the second corner", 4, [3, 4, 9]],
    ["the left edge", 5, [0, 5, 6, 10]],
    ["the right edge", 9, [4, 8, 9, 14]],
    ["the centre", 12, [7, 11, 12, 13, 17]],
    ["the third corner", 20, [15, 20, 21]],
    ["the bottom edge", 22, [17, 21, 22, 23]],
    ["the last cell", 24, [19, 23, 24]],
  ])(
    "changes only the cell and its orthogonal neighbours: %s",
    (_label, cell, changed) => {
      const before = stateOf(MIXED);

      const after = applyMove(before, { cell });

      expect(changedCells(before, after)).toEqual(changed);
    },
  );

  it("wraps kind 3 to 0", () => {
    const after = applyMove(stateOf(MIXED), { cell: 3 });

    // prettier-ignore
    expect(after.cells).toEqual([
      0, 1, 3, 0, 1,
      1, 2, 3, 1, 1,
      2, 3, 0, 1, 2,
      3, 0, 1, 2, 3,
      0, 1, 2, 3, 0,
    ]);
  });

  it("returns a new state and leaves its input unchanged", () => {
    const cells = [...MIXED];
    const before = stateOf(cells, 3);

    const after = applyMove(before, { cell: 12 });

    expect(after).not.toBe(before);
    expect(after.cells).not.toBe(cells);
    expect(cells).toEqual(MIXED);
    expect(before).toStrictEqual({ seed: 0, cells: MIXED, movesUsed: 3, limit: 20 });
    expect(after.movesUsed).toBe(4);
  });

  it("carries the seed and the limit over", () => {
    const before: State = { seed: 4294967295, cells: MIXED, movesUsed: 0, limit: 7 };

    expect(applyMove(before, { cell: 24 })).toMatchObject({
      seed: 4294967295,
      movesUsed: 1,
      limit: 7,
    });
  });

  it.each([25, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER])(
    "throws ERR_INVALID_MOVE for the cell %d",
    (cell) => {
      const error = thrownBy(() => applyMove(stateOf(MIXED), { cell }));

      expect(error).toBeInstanceOf(InvalidMoveError);
      expect(error).toBeInstanceOf(Error);
      expect(error).toMatchObject({
        name: "InvalidMoveError",
        code: "ERR_INVALID_MOVE",
        reason: "cell-out-of-range",
      });
    },
  );

  it("throws ERR_INVALID_MOVE once the board is solved", () => {
    const error = thrownBy(() => applyMove(stateOf(SOLVED, 4), { cell: 12 }));

    expect(error).toBeInstanceOf(InvalidMoveError);
    expect(error).toMatchObject({ code: "ERR_INVALID_MOVE", reason: "game-over" });
  });

  it("throws ERR_INVALID_MOVE once the move limit is reached", () => {
    const error = thrownBy(() => applyMove(stateOf(MIXED, 20), { cell: 12 }));

    expect(error).toBeInstanceOf(InvalidMoveError);
    expect(error).toMatchObject({ code: "ERR_INVALID_MOVE", reason: "game-over" });
  });

  it("reports game-over before an out-of-range cell on a finished game", () => {
    const error = thrownBy(() => applyMove(stateOf(MIXED, 20), { cell: 25 }));

    expect(error).toBeInstanceOf(InvalidMoveError);
    expect(error).toMatchObject({ code: "ERR_INVALID_MOVE", reason: "game-over" });
  });

  it("accepts the last move the limit allows", () => {
    const after = applyMove(stateOf(MIXED, 19), { cell: 12 });

    expect(after.movesUsed).toBe(20);
    expect(thrownBy(() => applyMove(after, { cell: 12 }))).toBeInstanceOf(
      InvalidMoveError,
    );
  });
});

describe("isOver", () => {
  it("is false for an unsolved board under the limit", () => {
    expect(isOver(stateOf(MIXED))).toBe(false);
    expect(isOver(stateOf(MIXED, 19))).toBe(false);
    expect(isOver(stateOf(ONE_FROM_SOLVED, 19))).toBe(false);
  });

  it("is true when every cell shares one kind", () => {
    expect(isOver(stateOf(SOLVED, 1))).toBe(true);
    expect(
      isOver(
        stateOf(
          SOLVED.map(() => 0),
          1,
        ),
      ),
    ).toBe(true);
  });

  it("is true when the move limit is reached", () => {
    expect(isOver(stateOf(MIXED, 20))).toBe(true);
    expect(isOver({ seed: 0, cells: MIXED, movesUsed: 7, limit: 7 })).toBe(true);
  });
});

describe("score", () => {
  it("is 20 for a board solved by the first move", () => {
    const solved = applyMove(stateOf(ONE_FROM_SOLVED), { cell: 12 });

    expect(solved.cells).toEqual(SOLVED.map(() => 0));
    expect(isOver(solved)).toBe(true);
    expect(score(solved)).toBe(20);
  });

  it("is 1 for a board solved by the twentieth move", () => {
    const solved = applyMove(stateOf(ONE_FROM_SOLVED, 19), { cell: 12 });

    expect(solved.movesUsed).toBe(20);
    expect(score(solved)).toBe(1);
  });

  it("is 0 when the limit is reached unsolved", () => {
    const unsolved = applyMove(stateOf(ONE_FROM_SOLVED, 19), { cell: 0 });

    expect(isOver(unsolved)).toBe(true);
    expect(score(unsolved)).toBe(0);
  });

  it("is 0 while the game is in progress", () => {
    expect(score(stateOf(MIXED, 5))).toBe(0);
  });

  it("counts from the state's own limit", () => {
    expect(score({ seed: 0, cells: SOLVED, movesUsed: 3, limit: 12 })).toBe(10);
  });
});

describe("createGame", () => {
  const seeds = Array.from({ length: 100 }, (_unused, seed) => seed);

  it("starts a 25-cell game of kinds 0 to 3 with no move used", () => {
    const state = createGame(1, SAMPLE_CONFIG);

    expect(Object.keys(state)).toEqual(["seed", "cells", "movesUsed", "limit"]);
    expect(state).toMatchObject({ seed: 1, movesUsed: 0, limit: 20 });
    expect(state.cells).toHaveLength(25);
    for (const kind of state.cells) {
      expect([0, 1, 2, 3]).toContain(kind);
    }
  });

  it("returns JSON data", () => {
    const state = createGame(1, SAMPLE_CONFIG);
    const copy: unknown = JSON.parse(JSON.stringify(state));

    expect(copy).toStrictEqual(state);
  });

  it("gives the same board for the same seed and another for a different one", () => {
    expect(createGame(5, SAMPLE_CONFIG)).toStrictEqual(createGame(5, SAMPLE_CONFIG));
    expect(createGame(5, SAMPLE_CONFIG).cells).not.toEqual(
      createGame(6, SAMPLE_CONFIG).cells,
    );
  });

  it.each([
    ["a negative seed", -1, 4294967295],
    ["a seed above 2^32", 2 ** 32 + 7, 7],
    ["a fractional seed", 7.9, 7],
    ["NaN", Number.NaN, 0],
  ])("reads %s as an unsigned 32-bit integer", (_label, seed, unsigned) => {
    const state = createGame(seed, SAMPLE_CONFIG);

    expect(state.seed).toBe(unsigned);
    expect(state).toStrictEqual(createGame(unsigned, SAMPLE_CONFIG));
  });

  it("takes the move limit from the config", () => {
    expect(createGame(1, { ...SAMPLE_CONFIG, moveLimit: 12 }).limit).toBe(12);
  });

  it.each(seeds)("never starts solved: seed %d", (seed) => {
    const state = createGame(seed, SAMPLE_CONFIG);

    expect(isOver(state)).toBe(false);
    expect(score(state)).toBe(0);
  });

  it.each(seeds)("is solved by pressing the drawn cells forward: seed %d", (seed) => {
    // The documented order of draws: the number of reverse moves, then their
    // cells.
    const prng = createPrng(seed);
    const reverseMoves = 6 + prng.nextInt(5);
    const drawn = Array.from({ length: reverseMoves }, () => prng.nextInt(25));

    // A prefix of the drawn cells may already solve the board.
    let state = createGame(seed, SAMPLE_CONFIG);
    for (const cell of drawn) {
      if (!isOver(state)) {
        state = applyMove(state, { cell });
      }
    }

    expect(new Set(state.cells).size).toBe(1);
    expect(state.movesUsed).toBeLessThanOrEqual(10);
    expect(score(state)).toBe(21 - state.movesUsed);
  });

  it("scrambles with reverse moves, which take kind 0 to the last kind", () => {
    const single: Config = { ...SAMPLE_CONFIG, scrambleMin: 1, scrambleMax: 1 };

    for (const seed of seeds) {
      const { cells } = createGame(seed, single);
      const turned = cells.filter((kind) => kind !== 0);

      expect(new Set(turned)).toEqual(new Set([3]));
      expect([3, 4, 5]).toContain(turned.length);
    }
  });

  it("draws one more reverse move when the scramble cancels out", () => {
    const four: Config = { ...SAMPLE_CONFIG, scrambleMin: 4, scrambleMax: 4 };

    // Seed 12958 draws cell 1 four times, which cancels out; the extra draw is
    // cell 10.
    const state = createGame(12958, four);
    // prettier-ignore
    expect(state.cells).toEqual([
      0, 0, 0, 0, 0,
      3, 0, 0, 0, 0,
      3, 3, 0, 0, 0,
      3, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
    ]);
    expect(score(applyMove(state, { cell: 10 }))).toBe(20);
  });

  it("redraws the whole scramble when the limit leaves no room for one more move", () => {
    const tight: Config = {
      ...SAMPLE_CONFIG,
      moveLimit: 4,
      scrambleMin: 4,
      scrambleMax: 4,
    };
    const prng = createPrng(12958);
    const drawScramble = (): number[] => {
      prng.nextInt(1);
      return Array.from({ length: 4 }, () => prng.nextInt(25));
    };

    // Seed 12958 first draws the same cell four times, which cancels out, and a
    // fifth reverse move would need five moves to undo.
    expect(drawScramble()).toEqual([1, 1, 1, 1]);
    const second = drawScramble();
    expect(second).toEqual([24, 12, 9, 9]);

    const state = createGame(12958, tight);
    // prettier-ignore
    expect(state).toStrictEqual({
      seed: 12958,
      cells: [
        0, 0, 0, 0, 2,
        0, 0, 3, 2, 2,
        0, 3, 3, 3, 2,
        0, 0, 3, 0, 3,
        0, 0, 0, 3, 3,
      ],
      movesUsed: 0,
      limit: 4,
    });
    const solved = second.reduce(
      (current, cell) => applyMove(current, { cell }),
      state,
    );
    expect(score(solved)).toBe(1);
  });

  it.each<[string, Partial<Config>]>([
    ["moveLimit 0", { moveLimit: 0, scrambleMin: 0, scrambleMax: 0 }],
    ["scrambleMax 0", { scrambleMin: 0, scrambleMax: 0 }],
    ["scrambleMin 0", { scrambleMin: 0 }],
    ["a negative scrambleMin", { scrambleMin: -1 }],
    ["scrambleMin above scrambleMax", { scrambleMin: 8, scrambleMax: 7 }],
    ["scrambleMax above moveLimit", { moveLimit: 9, scrambleMax: 10 }],
    ["a fractional moveLimit", { moveLimit: 20.5 }],
    ["a fractional scrambleMin", { scrambleMin: 6.5 }],
    ["a fractional scrambleMax", { scrambleMax: 9.5 }],
    ["a NaN moveLimit", { moveLimit: Number.NaN }],
    ["size 6", { size: 6 as 5 }],
    ["kinds 2", { kinds: 2 as 4 }],
  ])("throws a RangeError for %s", (_, override) => {
    const config = { ...SAMPLE_CONFIG, ...override };

    expect(thrownBy(() => createGame(1, config))).toBeInstanceOf(RangeError);
  });

  it("accepts the tightest config", () => {
    const tightest: Config = {
      ...SAMPLE_CONFIG,
      moveLimit: 1,
      scrambleMin: 1,
      scrambleMax: 1,
    };

    expect(createGame(1, tightest).limit).toBe(1);
  });
});

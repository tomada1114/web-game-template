import { describe, expect, it } from "vitest";

import {
  RULES_VERSION,
  SAMPLE_CONFIG,
  applyMove,
  createGame,
  createPrng,
  isOver,
  replay,
  score,
  seedFrom,
  type Move,
} from "../src/index.js";

const SEEDS = Array.from({ length: 1000 }, (_unused, seed) => seed);

describe("a game played with random moves", () => {
  // Each case is named after its seed, so a failure reproduces from its name.
  it.each(SEEDS)("replays to the fold of applyMove: seed %d", (seed) => {
    // The moves come from a generator of their own, so they are not the cells
    // the board was scrambled with.
    const prng = createPrng(seedFrom("moves:" + String(seed)));
    const moves: Move[] = [];
    let state = createGame(seed, SAMPLE_CONFIG);

    while (!isOver(state)) {
      const move = { cell: prng.nextInt(25) };
      const before = JSON.stringify(state);

      const next = applyMove(state, move);

      expect(JSON.stringify(state)).toBe(before);
      expect(next).not.toBe(state);
      expect(next.cells).not.toBe(state.cells);
      expect(next.movesUsed).toBe(state.movesUsed + 1);
      moves.push(move);
      state = next;
    }

    expect(state.movesUsed).toBe(moves.length);
    expect(moves.length).toBeLessThanOrEqual(20);
    expect(
      replay({ v: RULES_VERSION, seed, config: SAMPLE_CONFIG, moves }),
    ).toStrictEqual({ state, score: score(state) });
  });
});

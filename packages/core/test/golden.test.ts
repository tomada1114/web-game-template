import { describe, expect, it } from "vitest";

import { createGame, createPrng, dailySeed, replay } from "../src/index.js";

// Every expected value here is a literal, produced once and frozen. A value
// that changes means recorded runs no longer replay to the same result: after
// the first release, that is a RULES_VERSION bump in the same change, never an
// edited literal. The salt is the literal "golden", never the game's slug, and
// the config is spelled out so a changed SAMPLE_CONFIG default fails here too.
const CONFIG = {
  size: 5,
  kinds: 4,
  moveLimit: 20,
  scrambleMin: 6,
  scrambleMax: 10,
} as const;

describe("golden values", () => {
  it("derives the daily seed of 2026-11-05", () => {
    expect(dailySeed("2026-11-05", "golden")).toBe(1507154587);
  });

  it("draws the sequence of the daily seed", () => {
    const prng = createPrng(1507154587);

    expect([
      prng.nextU32(),
      prng.nextU32(),
      prng.nextInt(25),
      prng.nextInt(25),
      prng.nextInt(1000),
    ]).toEqual([3194974475, 3514243218, 20, 22, 527]);
  });

  it("generates the start board of seed 0", () => {
    // prettier-ignore
    expect(createGame(0, CONFIG)).toStrictEqual({
      seed: 0,
      cells: [
        3, 2, 3, 2, 2,
        2, 3, 3, 3, 3,
        0, 3, 0, 3, 0,
        0, 0, 3, 3, 2,
        0, 0, 0, 2, 3,
      ],
      movesUsed: 0,
      limit: 20,
    });
  });

  it("generates the start board of seed 1", () => {
    // prettier-ignore
    expect(createGame(1, CONFIG)).toStrictEqual({
      seed: 1,
      cells: [
        2, 3, 0, 0, 0,
        1, 2, 0, 3, 3,
        1, 1, 2, 2, 0,
        2, 2, 3, 1, 0,
        0, 3, 0, 3, 1,
      ],
      movesUsed: 0,
      limit: 20,
    });
  });

  it("generates the start board of seed 0xFFFFFFFF", () => {
    // prettier-ignore
    expect(createGame(4294967295, CONFIG)).toStrictEqual({
      seed: 4294967295,
      cells: [
        0, 3, 3, 2, 3,
        1, 0, 3, 0, 3,
        1, 0, 0, 0, 0,
        0, 1, 2, 0, 3,
        2, 0, 1, 2, 3,
      ],
      movesUsed: 0,
      limit: 20,
    });
  });

  it("generates the start board of the daily seed", () => {
    // prettier-ignore
    expect(createGame(1507154587, CONFIG)).toStrictEqual({
      seed: 1507154587,
      cells: [
        3, 0, 0, 3, 0,
        3, 3, 3, 3, 3,
        2, 0, 3, 1, 3,
        2, 2, 0, 0, 1,
        2, 2, 2, 1, 3,
      ],
      movesUsed: 0,
      limit: 20,
    });
  });

  it("replays an unfinished run of seed 1", () => {
    const moves = [0, 6, 12, 18, 24].map((cell) => ({ cell }));

    // prettier-ignore
    expect(replay({ v: 1, seed: 1, config: CONFIG, moves })).toStrictEqual({
      state: {
        seed: 1,
        cells: [
          3, 1, 0, 0, 0,
          3, 3, 2, 3, 3,
          1, 3, 3, 0, 0,
          2, 2, 1, 2, 2,
          0, 3, 0, 1, 2,
        ],
        movesUsed: 5,
        limit: 20,
      },
      score: 0,
    });
  });

  it("replays a solved run of the daily seed", () => {
    const moves = [18, 20, 22, 15, 18, 8, 17, 19, 5].map((cell) => ({ cell }));

    expect(replay({ v: 1, seed: 1507154587, config: CONFIG, moves })).toStrictEqual({
      state: {
        seed: 1507154587,
        cells: [
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        ],
        movesUsed: 9,
        limit: 20,
      },
      score: 12,
    });
  });
});

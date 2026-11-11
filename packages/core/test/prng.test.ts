import { describe, expect, it } from "vitest";

import { createPrng } from "../src/index.js";

// The expected sequences come from an independent BigInt implementation of
// splitmix32 and xoshiro128**, itself checked against the reference outputs of
// xoshiro128** for the state (1, 2, 3, 4): 11520, 0, 5927040, 70819200, …
const SEED_0 = [
  1789933344, 44971166, 2521387044, 3848737593, 1138324114, 749234105, 1899511038,
  1995189375, 3629653958, 19166872, 1711213692, 48427069,
];
const SEED_1 = [
  393288148, 2174103013, 3814759091, 2092745082, 1865176206, 2179171167, 3207394750,
  2858353069,
];
const SEED_MAX = [
  4104197751, 1825856343, 1152209388, 2427537429, 3685145430, 609215610, 4161674276,
  1502890106,
];

function draw(count: number, next: () => number): number[] {
  return Array.from({ length: count }, next);
}

describe("createPrng", () => {
  it.each([
    ["0", 0, SEED_0],
    ["1", 1, SEED_1],
    ["0xFFFFFFFF", 0xffffffff, SEED_MAX],
  ])("gives the xoshiro128** sequence of seed %s", (_label, seed, expected) => {
    const prng = createPrng(seed);

    expect(draw(expected.length, () => prng.nextU32())).toEqual(expected);
  });

  it.each([
    ["a seed above 2^32 wraps", 2 ** 32 + 1, SEED_1],
    ["a negative seed is its unsigned twin", -1, SEED_MAX],
    ["a fractional seed is truncated", 1.9, SEED_1],
    ["NaN is seed 0", Number.NaN, SEED_0],
    ["MAX_SAFE_INTEGER keeps its low 32 bits", Number.MAX_SAFE_INTEGER, SEED_MAX],
  ])("reads the seed as a 32-bit integer: %s", (_label, seed, expected) => {
    const prng = createPrng(seed);

    expect(draw(expected.length, () => prng.nextU32())).toEqual(expected);
  });

  it("keeps each generator's sequence its own", () => {
    const first = createPrng(0);
    const second = createPrng(0);

    const interleaved = [0, 1, 2, 3].flatMap(() => [first.nextU32(), second.nextU32()]);

    expect(interleaved).toEqual(SEED_0.slice(0, 4).flatMap((value) => [value, value]));
  });
});

describe("nextU32", () => {
  it("returns unsigned 32-bit integers", () => {
    const prng = createPrng(20261105);

    for (const value of draw(1000, () => prng.nextU32())) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(2 ** 32);
    }
  });
});

describe("nextInt", () => {
  it.each([1, 2, 3, 5, 25, 1000, 2 ** 31, 2 ** 31 + 1, 2 ** 32 - 1, 2 ** 32])(
    "returns integers in [0, %d)",
    (maxExclusive) => {
      const prng = createPrng(maxExclusive);

      for (const value of draw(300, () => prng.nextInt(maxExclusive))) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(maxExclusive);
      }
    },
  );

  it("rejects a draw at or above the bound and draws again", () => {
    const prng = createPrng(0);

    // Under the bound 3 a draw keeps its low two bits. Those bits of SEED_0 are
    // 0 2 0 1 2 1 2 3 2 0 0: the eighth draw is 3 and is skipped, never folded
    // back into range.
    expect(draw(10, () => prng.nextInt(3))).toEqual([0, 2, 0, 1, 2, 1, 2, 2, 0, 0]);
  });

  it("rejects under the smallest mask that covers the bound", () => {
    const prng = createPrng(1);

    // The low five bits of the SEED_1 sequence are 20 5 19 26 14 31 30 13 19 10
    // 25 24 0 16 11: every value from 25 up is skipped.
    expect(draw(11, () => prng.nextInt(25))).toEqual([
      20, 5, 19, 14, 13, 19, 10, 24, 0, 16, 11,
    ]);
  });

  it("consumes one draw for the bound 1", () => {
    const prng = createPrng(0);

    expect(draw(3, () => prng.nextInt(1))).toEqual([0, 0, 0]);
    expect(prng.nextU32()).toBe(SEED_0[3]);
  });

  it("returns the raw sequence for the bound 2^32", () => {
    const prng = createPrng(0);

    expect(draw(SEED_0.length, () => prng.nextInt(2 ** 32))).toEqual(SEED_0);
  });

  it("spreads its results evenly over the range", () => {
    const prng = createPrng(7);
    const counts = Array.from({ length: 25 }, () => 0);

    for (const value of draw(25_000, () => prng.nextInt(25))) {
      counts[value] = (counts[value] ?? 0) + 1;
    }

    // 1,000 expected per value; ±150 is more than four standard deviations.
    expect(Math.min(...counts)).toBeGreaterThan(850);
    expect(Math.max(...counts)).toBeLessThan(1150);
  });

  it.each([
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    2 ** 32 + 1,
    Number.MAX_SAFE_INTEGER,
  ])(
    "throws a RangeError for the bound %d without consuming a draw",
    (maxExclusive) => {
      const prng = createPrng(0);

      expect(() => prng.nextInt(maxExclusive)).toThrow(RangeError);
      expect(prng.nextU32()).toBe(SEED_0[0]);
    },
  );
});

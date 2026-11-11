/** A seeded generator of unsigned 32-bit integers. */
export interface Prng {
  /**
   * Draws the next value of the sequence.
   *
   * @returns An integer in `[0, 2^32)`.
   */
  nextU32(): number;

  /**
   * Draws a uniformly distributed integer below a bound.
   *
   * @remarks
   * Every call consumes at least one value of the sequence, and more when a
   * draw is rejected, so the number of calls is part of the order of draws.
   *
   * @param maxExclusive - An integer in `[1, 2^32]`.
   * @returns An integer in `[0, maxExclusive)`.
   * @throws RangeError when `maxExclusive` is not an integer in `[1, 2^32]`.
   */
  nextInt(maxExclusive: number): number;
}

const UINT32_COUNT = 0x1_0000_0000;

/**
 * Creates the repository's only random generator: xoshiro128** on four 32-bit
 * words, filled from the seed by splitmix32.
 *
 * @remarks
 * The same seed gives the same sequence on every JavaScript engine: the
 * generator uses 32-bit integer operations only.
 *
 * @param seed - Read as a 32-bit integer (`seed | 0`), so two seeds that differ
 *   by a multiple of `2^32` give the same sequence.
 */
export function createPrng(seed: number): Prng {
  let counter = seed | 0;
  const splitmix32 = (): number => {
    counter = (counter + 0x9e3779b9) | 0;
    let mixed = counter ^ (counter >>> 16);
    mixed = Math.imul(mixed, 0x21f0aaad);
    mixed ^= mixed >>> 15;
    mixed = Math.imul(mixed, 0x735a2d97);
    return mixed ^ (mixed >>> 15);
  };

  // xoshiro128** never leaves the all-zero state. splitmix32 maps its counter
  // one to one, so these four words differ and cannot all be zero.
  let word0 = splitmix32();
  let word1 = splitmix32();
  let word2 = splitmix32();
  let word3 = splitmix32();

  const nextU32 = (): number => {
    const scaled = Math.imul(word1, 5);
    const result = Math.imul((scaled << 7) | (scaled >>> 25), 9) >>> 0;
    const shifted = word1 << 9;
    word2 ^= word0;
    word3 ^= word1;
    word1 ^= word2;
    word0 ^= word3;
    word2 ^= shifted;
    word3 = (word3 << 11) | (word3 >>> 21);
    return result;
  };

  const nextInt = (maxExclusive: number): number => {
    if (
      !Number.isInteger(maxExclusive) ||
      maxExclusive < 1 ||
      maxExclusive > UINT32_COUNT
    ) {
      throw new RangeError("maxExclusive must be an integer from 1 to 2^32.");
    }
    // Rejection sampling under the smallest all-ones mask that covers the
    // bound: `nextU32() % maxExclusive` would favour the low results.
    let mask = maxExclusive - 1;
    mask |= mask >>> 1;
    mask |= mask >>> 2;
    mask |= mask >>> 4;
    mask |= mask >>> 8;
    mask |= mask >>> 16;
    let value = (nextU32() & mask) >>> 0;
    while (value >= maxExclusive) {
      value = (nextU32() & mask) >>> 0;
    }
    return value;
  };

  return { nextU32, nextInt };
}

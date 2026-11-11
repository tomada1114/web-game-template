import { createPrng, type Prng } from "../prng.js";

import { isUniform, turn, type Config, type State } from "./rules.js";

/**
 * Draws one scramble: reverse moves applied to a uniform board of kind `0`.
 *
 * @remarks
 * The order of draws is part of the rules: the number of reverse moves first,
 * then one cell per reverse move. Pressing the drawn cells forward undoes the
 * scramble. A scramble that cancels out draws one more reverse move while the
 * move limit still leaves room for its solution; without room the board is
 * returned uniform, for the caller to redraw.
 */
function scramble(prng: Prng, config: Config): number[] {
  const cellCount = config.size * config.size;
  const reverseStep = config.kinds - 1;
  let cells = Array.from({ length: cellCount }, () => 0);
  let reverseMoves =
    config.scrambleMin + prng.nextInt(config.scrambleMax - config.scrambleMin + 1);
  for (let drawn = 0; drawn < reverseMoves; drawn += 1) {
    cells = turn(cells, prng.nextInt(cellCount), reverseStep);
  }
  while (isUniform(cells) && reverseMoves < config.moveLimit) {
    cells = turn(cells, prng.nextInt(cellCount), reverseStep);
    reverseMoves += 1;
  }
  return cells;
}

/**
 * Starts a game on the board the seed generates.
 *
 * @remarks
 * The start board is never solved, and it can always be solved within
 * `config.moveLimit` moves. The same seed and config give the same board on
 * every JavaScript engine.
 *
 * @param seed - Read as an unsigned 32-bit integer (`seed >>> 0`), which is the
 *   value the returned state carries.
 * @param config - Not validated. It needs integers with
 *   `0 <= scrambleMin <= scrambleMax <= moveLimit` and `moveLimit >= 1`; other
 *   values break the guarantees above, throw a `RangeError`, or never return.
 */
export function createGame(seed: number, config: Config): State {
  const unsignedSeed = seed >>> 0;
  const prng = createPrng(unsignedSeed);
  let cells = scramble(prng, config);
  while (isUniform(cells)) {
    cells = scramble(prng, config);
  }
  return { seed: unsignedSeed, cells, movesUsed: 0, limit: config.moveLimit };
}

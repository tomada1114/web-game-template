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

function assertValidConfig(config: Config): void {
  // A record's config arrives as JSON, so the literal types prove nothing here.
  if ((config.size as number) !== 5 || (config.kinds as number) !== 4) {
    throw new RangeError("config.size must be 5 and config.kinds must be 4.");
  }
  const { moveLimit, scrambleMin, scrambleMax } = config;
  if (
    !Number.isInteger(moveLimit) ||
    !Number.isInteger(scrambleMin) ||
    !Number.isInteger(scrambleMax) ||
    scrambleMin < 1 ||
    scrambleMin > scrambleMax ||
    scrambleMax > moveLimit
  ) {
    throw new RangeError(
      "config needs integers with 1 <= scrambleMin <= scrambleMax <= moveLimit.",
    );
  }
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
 * @param config - Needs `size` 5, `kinds` 4, and integers with
 *   `1 <= scrambleMin <= scrambleMax <= moveLimit`.
 * @throws RangeError when `config` breaks those constraints, before any board
 *   is drawn.
 */
export function createGame(seed: number, config: Config): State {
  assertValidConfig(config);
  const unsignedSeed = seed >>> 0;
  const prng = createPrng(unsignedSeed);
  let cells = scramble(prng, config);
  while (isUniform(cells)) {
    cells = scramble(prng, config);
  }
  return { seed: unsignedSeed, cells, movesUsed: 0, limit: config.moveLimit };
}

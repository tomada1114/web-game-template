import { RulesVersionError } from "./errors.js";
import { RULES_VERSION } from "./rules-version.js";
import { createGame } from "./sample/generate.js";
import {
  applyMove,
  score,
  type Config,
  type Move,
  type State,
} from "./sample/rules.js";

/** Everything needed to reproduce a run, as plain JSON. */
export interface ReplayRecord {
  /** The `RULES_VERSION` the run was played under. */
  readonly v: number;
  /** The seed the game was created from. */
  readonly seed: number;
  /** The config the game was created with. */
  readonly config: Config;
  /** The moves played, in order. */
  readonly moves: readonly Move[];
}

/** Where a replayed run ends. */
export interface ReplayResult {
  /** The state after the last recorded move. */
  readonly state: State;
  /** The score of that state. */
  readonly score: number;
}

/**
 * Reproduces a run: `applyMove` folded over `record.moves`, starting from
 * `createGame(record.seed, record.config)`.
 *
 * @throws RulesVersionError (`ERR_RULES_VERSION`) when `record.v` is not
 *   `RULES_VERSION`.
 * @throws InvalidMoveError (`ERR_INVALID_MOVE`) when a recorded move is one
 *   `applyMove` rejects.
 */
export function replay(record: ReplayRecord): ReplayResult {
  if (record.v !== RULES_VERSION) {
    throw new RulesVersionError(RULES_VERSION);
  }
  const state = record.moves.reduce<State>(
    (current, move) => applyMove(current, move),
    createGame(record.seed, record.config),
  );
  return { state, score: score(state) };
}

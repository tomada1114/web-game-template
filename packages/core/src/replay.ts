import { ConfigMismatchError, RulesVersionError } from "./errors.js";
import { RULES_VERSION } from "./rules-version.js";
import { createGame } from "./sample/generate.js";
import {
  SAMPLE_CONFIG,
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
  /** The config the run was played under; `replay` accepts only the values of `SAMPLE_CONFIG`. */
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

// A record arrives as JSON, so its config is checked as a value of unknown shape.
function isRulesConfig(config: unknown): boolean {
  if (typeof config !== "object" || config === null) {
    return false;
  }
  const carried: Readonly<Record<string, unknown>> = { ...config };
  return Object.entries(SAMPLE_CONFIG).every(([key, value]) => carried[key] === value);
}

/**
 * Reproduces a run: `applyMove` folded over `record.moves`, starting from
 * `createGame(record.seed, SAMPLE_CONFIG)`.
 *
 * @remarks
 * The rules version decides the config; the record's copy is only compared,
 * so a record cannot set its own move limit and with it its own score.
 *
 * @throws RulesVersionError (`ERR_RULES_VERSION`) when `record.v` is not
 *   `RULES_VERSION`.
 * @throws ConfigMismatchError (`ERR_CONFIG_MISMATCH`) when `record.config`
 *   does not hold every field of `SAMPLE_CONFIG` with an equal value; checked
 *   after the version and before any move.
 * @throws InvalidMoveError (`ERR_INVALID_MOVE`) when a recorded move is one
 *   `applyMove` rejects.
 */
export function replay(record: ReplayRecord): ReplayResult {
  if (record.v !== RULES_VERSION) {
    throw new RulesVersionError(RULES_VERSION);
  }
  if (!isRulesConfig(record.config)) {
    throw new ConfigMismatchError();
  }
  const state = record.moves.reduce<State>(
    (current, move) => applyMove(current, move),
    createGame(record.seed, SAMPLE_CONFIG),
  );
  return { state, score: score(state) };
}

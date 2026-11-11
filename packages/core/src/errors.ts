/** Why a move was rejected. */
export type InvalidMoveReason = "cell-out-of-range" | "game-over";

const INVALID_MOVE_MESSAGES: Record<InvalidMoveReason, string> = {
  "cell-out-of-range": "move.cell must be the index of a cell on the board.",
  "game-over": "The game is over: no further move is accepted.",
};

/**
 * Thrown by `applyMove` for a move the rules do not accept.
 *
 * @remarks
 * It marks a caller bug: check `isOver` and the cell range before calling.
 */
export class InvalidMoveError extends Error {
  /** The stable identifier to branch on. */
  readonly code = "ERR_INVALID_MOVE" as const;

  /** Which of the two rejections happened. */
  readonly reason: InvalidMoveReason;

  /**
   * @param reason - Which of the two rejections happened.
   */
  constructor(reason: InvalidMoveReason) {
    super(INVALID_MOVE_MESSAGES[reason]);
    this.name = "InvalidMoveError";
    this.reason = reason;
  }
}

/**
 * Thrown by `replay` for a record played under another rules version.
 *
 * @remarks
 * Such a record is rejected, never reinterpreted under the current rules.
 */
export class RulesVersionError extends Error {
  /** The stable identifier to branch on. */
  readonly code = "ERR_RULES_VERSION" as const;

  /** The only rules version this build replays. */
  readonly expected: number;

  /**
   * @param expected - The only rules version this build replays.
   */
  constructor(expected: number) {
    super("record.v must be rules version " + String(expected) + ".");
    this.name = "RulesVersionError";
    this.expected = expected;
  }
}

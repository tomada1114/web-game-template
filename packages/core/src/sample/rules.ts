import { InvalidMoveError } from "../errors.js";

const SIZE = 5;
const KINDS = 4;

/**
 * The sample ruleset's parameters, as plain JSON.
 *
 * @remarks
 * A replay record carries the config, so a run is reproduced with the
 * parameters it was played under. `size` and `kinds` are fixed: `State` does
 * not carry them, so `applyMove` could not honour another value.
 */
export interface Config {
  /** The board's side: the board has `size * size` cells. */
  readonly size: 5;
  /** The number of tile kinds; a cell holds a kind from `0` to `kinds - 1`. */
  readonly kinds: 4;
  /** The number of moves a game allows. */
  readonly moveLimit: number;
  /** The fewest reverse moves that scramble the start board. */
  readonly scrambleMin: number;
  /** The most reverse moves that scramble the start board. */
  readonly scrambleMax: number;
}

/** The parameters the sample game is played under. */
export const SAMPLE_CONFIG: Config = {
  size: SIZE,
  kinds: KINDS,
  moveLimit: 20,
  scrambleMin: 6,
  scrambleMax: 10,
};

/**
 * A game in progress or finished, as JSON data: integers and one array of
 * integers.
 *
 * @remarks
 * A state survives a round trip through JSON unchanged, which is how a run is
 * compared.
 */
export interface State {
  /** The unsigned 32-bit seed the start board was generated from. */
  readonly seed: number;
  /** The kind of each cell, row by row from the top left. */
  readonly cells: readonly number[];
  /** The number of moves played so far. */
  readonly movesUsed: number;
  /** The number of moves the game allows. */
  readonly limit: number;
}

/** One move: the cell the player picks. */
export interface Move {
  /** The cell's index, row by row from the top left, starting at `0`. */
  readonly cell: number;
}

/**
 * Whether every cell holds the same kind.
 *
 * @internal
 */
export function isUniform(cells: readonly number[]): boolean {
  const first = cells[0];
  return cells.every((kind) => kind === first);
}

/**
 * Returns a copy of `cells` with `cell` and its orthogonal neighbours moved
 * `step` kinds forward, wrapping after the last kind.
 *
 * @internal
 */
export function turn(cells: readonly number[], cell: number, step: number): number[] {
  const column = cell % SIZE;
  return cells.map((kind, index) => {
    const turned =
      index === cell ||
      index === cell - SIZE ||
      index === cell + SIZE ||
      (index === cell - 1 && column !== 0) ||
      (index === cell + 1 && column !== SIZE - 1);
    return turned ? (kind + step) % KINDS : kind;
  });
}

/**
 * Plays one move: the picked cell and its orthogonal neighbours advance by one
 * kind, the last kind wrapping to `0`.
 *
 * @returns A new state; `state` is left unchanged.
 * @throws InvalidMoveError (`ERR_INVALID_MOVE`) when `move.cell` is not the
 *   index of a cell on the board, or when the game is over.
 */
export function applyMove(state: State, move: Move): State {
  const { cell } = move;
  if (!Number.isInteger(cell) || cell < 0 || cell >= state.cells.length) {
    throw new InvalidMoveError("cell-out-of-range");
  }
  if (isOver(state)) {
    throw new InvalidMoveError("game-over");
  }
  return {
    seed: state.seed,
    cells: turn(state.cells, cell, 1),
    movesUsed: state.movesUsed + 1,
    limit: state.limit,
  };
}

/**
 * Whether the game accepts no further move: the board is solved (every cell
 * holds the same kind) or the move limit is reached.
 */
export function isOver(state: State): boolean {
  return isUniform(state.cells) || state.movesUsed >= state.limit;
}

/**
 * Scores a state: `limit + 1 - movesUsed` when the board is solved, so a faster
 * solution scores higher, and `0` otherwise.
 *
 * @returns An integer from `0` to `limit`.
 */
export function score(state: State): number {
  return isUniform(state.cells) ? state.limit + 1 - state.movesUsed : 0;
}

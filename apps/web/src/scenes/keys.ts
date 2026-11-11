/** Scene keys, one per scene file. */
export const SceneKey = {
  boot: "boot",
  title: "title",
  play: "play",
  result: "result",
} as const;

/** Start data for Play: the seed of the board to play. */
export interface PlayData {
  readonly seed: number;
  /** The session's UTC day when this is the daily board; absent for Practice. */
  readonly day?: string;
}

/** Start data for Result: the finished state's seed and the outcome lines. */
export interface ResultData {
  readonly seed: number;
  readonly headline: string;
  readonly score: string;
  /** The session's UTC day when this was the daily board; absent for Practice. */
  readonly day?: string;
  /** The numeric score, 0 when unsolved. */
  readonly points: number;
  /** The moves played. */
  readonly movesUsed: number;
  /** The board's move limit, which is also its highest score. */
  readonly limit: number;
}

/** A fresh Practice seed; randomness stays in `apps/web` and enters core as a value. */
export function practiceSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

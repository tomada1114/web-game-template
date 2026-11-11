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
}

/** Start data for Result: the finished state's seed and the outcome lines. */
export interface ResultData {
  readonly seed: number;
  readonly headline: string;
  readonly score: string;
}

/** A fresh Practice seed; randomness stays in `apps/web` and enters core as a value. */
export function practiceSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

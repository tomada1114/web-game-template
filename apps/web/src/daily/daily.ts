import { type KeyValueStore } from "../platform/platform.js";

const BAR_LENGTH = 10;

/** Returns the UTC calendar date of `now` as `YYYY-MM-DD`. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Returns a function that computes the day from `clock` on its first call and
 * returns that same day on every later call, so a session never rolls over
 * past midnight.
 */
export function createSessionDay(clock: () => Date): () => string {
  let day: string | undefined;
  return () => {
    day ??= utcDay(clock());
    return day;
  };
}

/** The storage key of the best score for `day`: `<slug>:best:<day>`. */
export function bestKey(slug: string, day: string): string {
  return `${slug}:best:${day}`;
}

/** The outcome of one finished daily board. */
export interface DailyOutcome {
  /** The score, 0 when the board ended unsolved. */
  readonly score: number;
  /** The moves played. */
  readonly movesUsed: number;
  /** The highest score a board can give. */
  readonly maxScore: number;
}

/**
 * Returns the three-line share text, joined by `\n` with no trailing newline:
 * the title and day, the score and moves, and a 10-glyph bar filled in
 * proportion to `score / maxScore`.
 */
export function shareText(title: string, day: string, outcome: DailyOutcome): string {
  const max = String(outcome.maxScore);
  const detail =
    outcome.score > 0
      ? `${String(outcome.score)}/${max} · ${String(outcome.movesUsed)} moves`
      : `0/${max} · out of moves`;
  const scaled =
    outcome.maxScore > 0
      ? Math.floor((outcome.score * BAR_LENGTH) / outcome.maxScore)
      : 0;
  const filled = Math.min(BAR_LENGTH, Math.max(0, scaled));
  const bar = "▰".repeat(filled) + "▱".repeat(BAR_LENGTH - filled);
  return `${title} ${day}\n${detail}\n${bar}`;
}

/**
 * Reads the stored best under `key`; `null` when none is stored or the value is
 * not a positive integer.
 */
export function readBest(storage: KeyValueStore, key: string): number | null {
  const raw = storage.getItem(key);
  if (raw === null || !/^[1-9]\d*$/.test(raw)) return null;
  return Number(raw);
}

/**
 * Stores `score` under `key` when it is a new best: `score > 0` and either no
 * best is stored or `score` beats it.
 *
 * @returns Whether the stored best increased.
 */
export function recordBest(
  storage: KeyValueStore,
  key: string,
  score: number,
): boolean {
  if (score <= 0) return false;
  const best = readBest(storage, key);
  if (best !== null && score <= best) return false;
  storage.setItem(key, String(score));
  return true;
}

/** Title's daily lines: `Daily · <day>`, and `Best today: <n>` or `null` to hide it. */
export function titleLines(
  storage: KeyValueStore,
  slug: string,
  day: string,
): { readonly daily: string; readonly best: string | null } {
  const best = readBest(storage, bestKey(slug, day));
  return {
    daily: `Daily · ${day}`,
    best: best === null ? null : `Best today: ${String(best)}`,
  };
}

/** Result's buttons in focus order; Copy result appears on a daily board only. */
export function resultButtons(daily: boolean): readonly string[] {
  return daily
    ? ["Copy result", "Again", "Practice", "Title"]
    : ["Again", "Practice", "Title"];
}

/** The part of the Clipboard API the copy uses. */
export type ClipboardWriter = Pick<Clipboard, "writeText">;

/**
 * Writes `text` to `clipboard`.
 *
 * @returns `true` when written; `false` when the clipboard is missing or rejects,
 * and the caller shows the text in a selectable box instead.
 */
export async function copyText(
  text: string,
  clipboard: ClipboardWriter | undefined,
): Promise<boolean> {
  if (clipboard === undefined) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The fallback share box's inline style; only the box is selectable, the body stays not. */
export const SHARE_BOX_STYLE: Readonly<Record<string, string>> = {
  "user-select": "text",
  "-webkit-user-select": "text",
};

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * Derives a seed from text: FNV-1a 32-bit over the UTF-16 code units.
 *
 * @param text - Hashed one code unit at a time, so a character outside the
 *   Basic Multilingual Plane counts as its two surrogates.
 * @returns An integer in `[0, 2^32)`; `2166136261` for the empty string.
 */
export function seedFrom(text: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), FNV_PRIME);
  }
  return hash >>> 0;
}

/**
 * Derives the seed every player shares on one day: `seedFrom(salt + ":" + day)`.
 *
 * @param day - The day as `YYYY-MM-DD`, computed in UTC by the caller. Core
 *   never reads a clock.
 * @param salt - The game's slug, so two games do not share a daily board.
 * @returns An integer in `[0, 2^32)`.
 */
export function dailySeed(day: string, salt: string): number {
  return seedFrom(salt + ":" + day);
}

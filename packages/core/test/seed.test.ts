import { describe, expect, it } from "vitest";

import { dailySeed, seedFrom } from "../src/index.js";

describe("seedFrom", () => {
  it("returns the FNV-1a offset basis for the empty string", () => {
    expect(seedFrom("")).toBe(2166136261);
  });

  it.each([
    // Published FNV-1a 32-bit test vectors: 0xE40C292C and 0xBF9CF968.
    ["a", 3826002220],
    ["foobar", 3214735720],
  ])("hashes %j to its FNV-1a 32-bit value", (text, expected) => {
    expect(seedFrom(text)).toBe(expected);
  });

  it.each([
    // One step per UTF-16 code unit, from an independent BigInt FNV-1a: U+00E9
    // is one unit (two bytes in UTF-8), U+3042 one unit (three bytes), and
    // U+1F3B2 two surrogate units (one code point).
    ["\u00e9", 1812687940],
    ["\u3042", 3341101957],
    ["\u{1f3b2}", 1060007403],
    ["\ud83c\udfb2", 1060007403],
  ])("hashes UTF-16 code units, not bytes or code points: %j", (text, expected) => {
    expect(seedFrom(text)).toBe(expected);
  });

  it.each(["", "a", "\u{1f3b2}", "x".repeat(10_000)])(
    "returns an unsigned 32-bit integer (case %#)",
    (text) => {
      const seed = seedFrom(text);

      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2 ** 32);
    },
  );

  it("tells apart texts that differ in order", () => {
    expect(seedFrom("on")).not.toBe(seedFrom("no"));
  });
});

describe("dailySeed", () => {
  it("is seedFrom of the salt, a colon, and the day", () => {
    expect(dailySeed("2026-11-05", "golden")).toBe(seedFrom("golden:2026-11-05"));
  });

  it("puts the salt before the day", () => {
    expect(dailySeed("2026-11-05", "golden")).not.toBe(seedFrom("2026-11-05:golden"));
  });

  it("changes with the day and with the salt", () => {
    const seed = dailySeed("2026-11-05", "golden");

    expect(dailySeed("2026-11-06", "golden")).not.toBe(seed);
    expect(dailySeed("2026-11-05", "other")).not.toBe(seed);
  });

  it("is the offset-basis hash of a lone colon for empty parts", () => {
    expect(dailySeed("", "")).toBe(seedFrom(":"));
  });
});

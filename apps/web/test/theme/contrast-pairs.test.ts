import { describe, expect, it } from "vitest";

import { colors } from "../../src/theme/tokens.js";

interface Colour {
  readonly hex: number;
  readonly css?: string;
}

interface Pair {
  readonly name: string;
  readonly fg: string;
  readonly bg: string;
  readonly kind: string;
}

const thresholds: Readonly<Record<string, number>> = { text: 4.5, large: 3.0, ui: 3.0 };

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: number): number {
  return (
    0.2126 * channel((hex >> 16) & 0xff) +
    0.7152 * channel((hex >> 8) & 0xff) +
    0.0722 * channel(hex & 0xff)
  );
}

function contrastRatio(a: number, b: number): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (lighter + 0.05) / (darker + 0.05);
}

function isPair(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every problem with the colours and pairs, one line each; empty when all pass. */
function contrastProblems(
  palette: Readonly<Record<string, Colour>>,
  pairs: unknown,
): string[] {
  const problems: string[] = [];
  if (!Array.isArray(pairs)) return ["the contrast pairs are not an array"];
  if (pairs.length === 0) problems.push("no contrast pair is listed");
  const valid = new Set<string>();
  for (const [token, { hex, css }] of Object.entries(palette)) {
    if (!Number.isInteger(hex) || hex < 0 || hex > 0xffffff) {
      problems.push(`${token}: hex ${String(hex)} is not a 24-bit colour`);
      continue;
    }
    valid.add(token);
    const expected = `#${hex.toString(16).padStart(6, "0")}`;
    if (css !== undefined && css.toLowerCase() !== expected) {
      problems.push(`${token}: css ${css} does not match hex ${expected}`);
    }
  }
  const names = new Set<string>();
  const combos = new Map<string, string>();
  const used = new Set<string>();
  for (const [index, entry] of (pairs as unknown[]).entries()) {
    if (!isPair(entry)) {
      problems.push(`pair #${String(index)} is not an object`);
      continue;
    }
    const { name, fg: fgToken, bg: bgToken, kind } = entry;
    if (typeof name !== "string" || name === "") {
      problems.push(`pair #${String(index)} has no name`);
      continue;
    }
    if (
      typeof fgToken !== "string" ||
      typeof bgToken !== "string" ||
      typeof kind !== "string"
    ) {
      problems.push(`"${name}": fg, bg and kind must be strings`);
      continue;
    }
    if (names.has(name)) problems.push(`duplicate pair name "${name}"`);
    names.add(name);
    const combo = `${fgToken}\u0000${bgToken}`;
    const first = combos.get(combo);
    if (first !== undefined) {
      problems.push(
        `"${name}": ${fgToken} on ${bgToken} is already listed as "${first}"`,
      );
    } else combos.set(combo, name);
    used.add(fgToken);
    used.add(bgToken);
    const threshold = Object.hasOwn(thresholds, kind) ? thresholds[kind] : undefined;
    if (threshold === undefined) problems.push(`"${name}": unknown kind "${kind}"`);
    const fg = Object.hasOwn(palette, fgToken) ? palette[fgToken] : undefined;
    const bg = Object.hasOwn(palette, bgToken) ? palette[bgToken] : undefined;
    if (fg === undefined) problems.push(`"${name}": ${fgToken} is not a colour token`);
    if (bg === undefined) problems.push(`"${name}": ${bgToken} is not a colour token`);
    if (fg === undefined || bg === undefined || threshold === undefined) continue;
    if (!valid.has(fgToken) || !valid.has(bgToken)) continue;
    const ratio = contrastRatio(fg.hex, bg.hex);
    if (!(ratio >= threshold)) {
      problems.push(
        `"${name}" ${ratio.toFixed(2)} < ${threshold.toFixed(1)} (${kind})`,
      );
    }
  }
  for (const token of Object.keys(palette)) {
    if (!used.has(token)) problems.push(`${token} appears in no contrast pair`);
  }
  return problems;
}

// A computed specifier keeps the file out of the web test program's module graph,
// which resolves no JSON and carries no Node or Vite ambient types. Parsed as
// unknown: contrastProblems checks the shape, so a malformed file is reported
// rather than crashing a test.
const pairsUrl = new URL(
  "../../../../docs/design/contrast-pairs.json",
  import.meta.url,
);
const pairsModule = (await import(pairsUrl.href, { with: { type: "json" } })) as {
  readonly default: unknown;
};
const pairsFile = pairsModule.default;
const pairs: readonly Pair[] = Array.isArray(pairsFile) ? (pairsFile as Pair[]) : [];

describe("contrast pairs", () => {
  it("passes every pair in docs/design/contrast-pairs.json against tokens.ts", () => {
    expect(contrastProblems(colors, pairsFile)).toEqual([]);
  });

  it("measures the ratios the design direction records", () => {
    const measured = Object.fromEntries(
      pairs.map((p) => {
        const palette: Readonly<Record<string, Colour>> = colors;
        const fg = Object.hasOwn(palette, p.fg) ? palette[p.fg] : undefined;
        const bg = Object.hasOwn(palette, p.bg) ? palette[p.bg] : undefined;
        if (fg === undefined || bg === undefined) {
          return [p.name, `names a missing token (${p.fg} on ${p.bg})`];
        }
        return [p.name, contrastRatio(fg.hex, bg.hex).toFixed(2)];
      }),
    );
    expect(measured).toEqual({
      "text on bg": "16.15",
      "text on surface": "14.18",
      "textMuted on bg": "8.14",
      "textMuted on surface": "7.14",
      "accent on bg (control, focus)": "7.77",
      "accent on surface (focus ring)": "6.82",
      "onAccent on accent (button label)": "7.77",
      "tile0 on surface": "6.99",
      "tile1 on surface": "4.53",
      "tile1 on bg": "5.16",
      "tile2 on surface": "4.60",
      "tile3 on surface": "5.14",
      "glyphOnTile on tile0": "7.96",
      "glyphOnTile on tile1": "5.16",
      "glyphOnTile on tile2": "5.24",
      "glyphOnTile on tile3": "5.86",
    });
  });
});

describe("contrastProblems", () => {
  const black = { hex: 0x000000, css: "#000000" };
  const white = { hex: 0xffffff, css: "#FFFFFF" };

  it("fails a pair below its threshold, naming its ratio and threshold", () => {
    const palette = { fg: { hex: 0x6b7280 }, bg: { hex: 0x1f232b } };
    expect(
      contrastProblems(palette, [{ name: "muted", fg: "fg", bg: "bg", kind: "text" }]),
    ).toEqual(['"muted" 3.26 < 4.5 (text)']);
  });

  it("passes a ratio just above its threshold and fails one just below and the same token on both sides", () => {
    // #767676 on white is the textbook 4.54; #777777 on white is 4.48.
    expect(
      contrastProblems({ a: { hex: 0x767676 }, w: white }, [
        { name: "p", fg: "a", bg: "w", kind: "text" },
      ]),
    ).toEqual([]);
    expect(
      contrastProblems({ a: { hex: 0x777777 }, w: white }, [
        { name: "p", fg: "a", bg: "w", kind: "text" },
      ]),
    ).toEqual(['"p" 4.48 < 4.5 (text)']);
    expect(
      contrastProblems({ w: white }, [{ name: "same", fg: "w", bg: "w", kind: "ui" }]),
    ).toEqual(['"same" 1.00 < 3.0 (ui)']);
  });

  it("applies 3.0 to large and ui pairs", () => {
    const palette = { a: { hex: 0x949494 }, w: white };
    expect(
      contrastProblems(palette, [
        { name: "l", fg: "a", bg: "w", kind: "large" },
        { name: "u", fg: "w", bg: "a", kind: "ui" },
      ]),
    ).toEqual([]);
  });

  it("fails a pair that names no colour token", () => {
    expect(
      contrastProblems({ black }, [
        { name: "p", fg: "black", bg: "ghost", kind: "text" },
      ]),
    ).toEqual(['"p": ghost is not a colour token']);
  });

  it("fails a colour token that appears in no pair", () => {
    const palette = { black, white, danger: { hex: 0xff0000 } };
    expect(
      contrastProblems(palette, [
        { name: "p", fg: "white", bg: "black", kind: "text" },
      ]),
    ).toEqual(["danger appears in no contrast pair"]);
  });

  it("fails an unknown kind and a duplicate name", () => {
    const palette = { black, white };
    expect(
      contrastProblems(palette, [
        { name: "p", fg: "white", bg: "black", kind: "huge" },
        { name: "p", fg: "black", bg: "white", kind: "text" },
      ]),
    ).toEqual(['"p": unknown kind "huge"', 'duplicate pair name "p"']);
  });

  it("fails an empty pair list rather than passing vacuously", () => {
    expect(contrastProblems({}, [])).toEqual(["no contrast pair is listed"]);
  });

  it("fails a css string that is not the hex number", () => {
    const palette = {
      black: { hex: 0x000000, css: "#000001" },
      white: { hex: 0xffffff, css: "#ffffff" },
    };
    expect(
      contrastProblems(palette, [
        { name: "p", fg: "white", bg: "black", kind: "text" },
      ]),
    ).toEqual(["black: css #000001 does not match hex #000000"]);
  });

  it("fails a duplicate fg/bg pair under another name", () => {
    expect(
      contrastProblems({ black, white }, [
        { name: "a", fg: "white", bg: "black", kind: "text" },
        { name: "b", fg: "white", bg: "black", kind: "text" },
        { name: "c", fg: "black", bg: "white", kind: "text" },
      ]),
    ).toEqual(['"b": white on black is already listed as "a"']);
  });

  it("fails a pair with a missing or empty name", () => {
    expect(
      contrastProblems({ black, white }, [
        { name: "p", fg: "white", bg: "black", kind: "text" },
        { fg: "black", bg: "white", kind: "text" },
        { name: "", fg: "black", bg: "white", kind: "text" },
      ]),
    ).toEqual(["pair #1 has no name", "pair #2 has no name"]);
  });

  it("fails a hex outside 0..0xFFFFFF or not an integer", () => {
    const palette = {
      black,
      white,
      big: { hex: 0x1000000 },
      negative: { hex: -1 },
      fraction: { hex: 0.5 },
    };
    expect(
      contrastProblems(palette, [
        { name: "p", fg: "white", bg: "black", kind: "text" },
        { name: "q", fg: "big", bg: "negative", kind: "ui" },
        { name: "r", fg: "fraction", bg: "black", kind: "ui" },
      ]),
    ).toEqual([
      "big: hex 16777216 is not a 24-bit colour",
      "negative: hex -1 is not a 24-bit colour",
      "fraction: hex 0.5 is not a 24-bit colour",
    ]);
  });

  it("reports a pairs file that is not an array, or holds a non-object entry", () => {
    expect(contrastProblems({}, { pairs: [] })).toEqual([
      "the contrast pairs are not an array",
    ]);
    expect(
      contrastProblems({ black, white }, [
        null,
        { name: "p", fg: "white", bg: "black", kind: "text" },
        { name: "q", fg: 1, bg: "black", kind: "text" },
      ]),
    ).toEqual(["pair #0 is not an object", '"q": fg, bg and kind must be strings']);
  });
});

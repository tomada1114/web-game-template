import { describe, expect, it } from "vitest";

import { colors, layout, motion, radius, space, type } from "../src/theme/tokens.js";

describe("tokens", () => {
  it("holds the colours from the design direction, as numbers and css strings", () => {
    expect(colors).toEqual({
      bg: { hex: 0x15171c, css: "#15171C" },
      surface: { hex: 0x1f232b, css: "#1F232B" },
      text: { hex: 0xf2f3f5, css: "#F2F3F5" },
      textMuted: { hex: 0xa9afba, css: "#A9AFBA" },
      accent: { hex: 0x56b4e9, css: "#56B4E9" },
      onAccent: { hex: 0x15171c, css: "#15171C" },
      tile0: { hex: 0xe69f00, css: "#E69F00" },
      tile1: { hex: 0x2f8fd8, css: "#2F8FD8" },
      tile2: { hex: 0x009e73, css: "#009E73" },
      tile3: { hex: 0xcc79a7, css: "#CC79A7" },
      glyphOnTile: { hex: 0x15171c, css: "#15171C" },
    });
  });

  it("holds the type, radius, spacing, motion and layout values", () => {
    expect(type).toEqual({
      font: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      title: 64,
      heading: 40,
      body: 28,
      caption: 22,
    });
    expect(radius).toEqual({ tile: 12, button: 16 });
    expect(space.unit).toBe(8);
    expect(motion.moveMs).toBe(120);
    expect(motion.sceneFadeMs).toBe(150);
    expect(layout).toMatchObject({
      designWidth: 720,
      designHeight: 1280,
      tapMin: 88,
      focusRing: 2,
      focusOffset: 4,
      tileSize: 112,
      tileGap: 16,
      resultPauseMs: 300,
    });
  });

  it("keeps Result's three buttons in one row of the frame, each a full tap target", () => {
    expect(layout.rowButtonWidth).toBeGreaterThanOrEqual(layout.tapMin);
    expect(layout.rowButtonWidth * 3 + space.unit * 4).toBeLessThanOrEqual(
      layout.designWidth,
    );
  });
});

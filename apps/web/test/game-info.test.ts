import { describe, expect, it } from "vitest";

import { GAME_SLUG, GAME_TITLE } from "../src/game-info.js";

// The shape, not the literal values: bootstrap renames both, and this test
// still runs in the generated repository.
describe("game-info", () => {
  it("names the game with a lowercase, hyphen-separated slug", () => {
    expect(GAME_SLUG).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it("gives the game a non-blank display title", () => {
    expect(GAME_TITLE.trim()).not.toBe("");
  });
});

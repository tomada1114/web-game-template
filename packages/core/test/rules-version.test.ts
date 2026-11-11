import { describe, expect, it } from "vitest";

import { RULES_VERSION } from "../src/index.js";

describe("RULES_VERSION", () => {
  it("starts the rules history at 1", () => {
    expect(RULES_VERSION).toBe(1);
  });
});

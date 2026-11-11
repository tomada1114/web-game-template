import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ESLint, type Linter } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const fixture = (name: string): string =>
  readFileSync(new URL(`fixtures/determinism/${name}`, import.meta.url), "utf8");

const DETERMINISM_RULES = new Set([
  "no-restricted-globals",
  "no-restricted-properties",
  "no-restricted-syntax",
]);

// The rule id each line of forbidden.ts must produce, in line order.
const EXPECTED_RULES = [
  ...Array<string>(16).fill("no-restricted-globals"),
  ...Array<string>(23).fill("no-restricted-properties"),
  ...Array<string>(17).fill("no-restricted-syntax"),
];

// The repository's own eslint.config.mjs is loaded from `cwd`. A path given to
// lintText exists in no tsconfig, so the project service would reject it with a
// parsing error; type-aware linting is switched off for that reason alone, and
// the three determinism rules need no type information.
const eslint = new ESLint({
  cwd: repoRoot,
  overrideConfig: { ...tseslint.configs.disableTypeChecked, files: ["**/*.ts"] },
});

async function determinismMessages(
  code: string,
  filePath: string,
): Promise<Linter.LintMessage[]> {
  expect(await eslint.isPathIgnored(filePath)).toBe(false);
  const [result] = await eslint.lintText(code, { filePath });
  if (result === undefined) throw new Error(`no lint result for ${filePath}`);
  const fatal = result.messages.filter((message) => message.fatal === true);
  expect(fatal).toEqual([]);
  return result.messages.filter(
    (message) => message.ruleId !== null && DETERMINISM_RULES.has(message.ruleId),
  );
}

describe("the packages/core determinism lint guard", () => {
  const forbidden = fixture("forbidden.ts");
  const forbiddenLines = forbidden.trimEnd().split("\n");

  it("has one fixture line per forbidden API", () => {
    expect(forbiddenLines).toHaveLength(EXPECTED_RULES.length);
  });

  it("reports each forbidden line exactly once, with its rule id", async () => {
    const messages = await determinismMessages(
      forbidden,
      "packages/core/src/forbidden.ts",
    );
    const report = forbiddenLines.map((text, index) => {
      const line = index + 1;
      return {
        line,
        text,
        rules: messages
          .filter((message) => message.line === line)
          .map((message) => message.ruleId),
      };
    });
    const expected = forbiddenLines.map((text, index) => ({
      line: index + 1,
      text,
      rules: [EXPECTED_RULES[index]],
    }));
    expect(report).toEqual(expected);
  });

  it("accepts the allowed Math members and integer operators", async () => {
    expect(
      await determinismMessages(fixture("allowed.ts"), "packages/core/src/allowed.ts"),
    ).toEqual([]);
  });

  it("does not apply outside packages/core/src", async () => {
    expect(await determinismMessages(forbidden, "apps/web/src/forbidden.ts")).toEqual(
      [],
    );
  });

  it("does not apply to core's tests", async () => {
    expect(
      await determinismMessages(forbidden, "packages/core/test/forbidden.ts"),
    ).toEqual([]);
  });
});

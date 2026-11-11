import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { getFileInfo } from "prettier";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import vitestConfig from "../vitest.config.js";

// `.claude/skills/` is hand-authored source, so every tool checks it like any
// other source file. What must not come back is an ignore entry for it: a
// skill file that is checked nowhere drifts unlinted and unformatted with CI
// green. `.claude/worktrees/` (full checkouts) and `tests/fixtures/` stay
// skipped.
//
// Both tools are asked through their own APIs rather than by spawning their
// CLIs. A subprocess reports "ignored" and "could not run at all" with the same
// exit code, so an exit-status assertion passes on a run where the tool never
// started — which is what the minimum-Node CI leg does to a nested `pnpm exec`.
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const skill = ".claude/skills/merge-dependabot";
const worktrees = ".claude/worktrees/";
const fixtures = "tests/fixtures/";

type RuleSetting = number | readonly [number, ...unknown[]];

interface EffectiveConfig {
  rules?: Record<string, RuleSetting | undefined>;
}

function ruleSeverity(setting: RuleSetting | undefined): number | undefined {
  return typeof setting === "number" ? setting : setting?.[0];
}

const eslint = new ESLint({ cwd: repoRoot });

function readKey(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/** The `exclude` list of vitest.config.ts's `unit` project. */
function unitProjectExclude(): readonly string[] {
  const projects = readKey(readKey(vitestConfig, "test"), "projects");
  // The `every` predicate is what narrows `Array.isArray`'s `any[]`.
  if (
    !Array.isArray(projects) ||
    !projects.every(
      (entry): entry is Record<string, unknown> =>
        typeof entry === "object" && entry !== null,
    )
  ) {
    throw new TypeError("vitest.config.ts must declare test.projects");
  }
  const unit = projects.find(
    (project) => readKey(readKey(project, "test"), "name") === "unit",
  );
  const exclude = readKey(readKey(unit, "test"), "exclude");
  if (
    !Array.isArray(exclude) ||
    !exclude.every((entry): entry is string => typeof entry === "string")
  ) {
    throw new TypeError("the unit project's exclude must be an array of strings");
  }
  return exclude;
}

function ignoredByEslint(relative: string): Promise<boolean> {
  return eslint.isPathIgnored(path.join(repoRoot, relative));
}

async function ignoredByPrettier(relative: string): Promise<boolean> {
  const info = await getFileInfo(path.join(repoRoot, relative), {
    ignorePath: path.join(repoRoot, ".prettierignore"),
  });
  return info.ignored;
}

describe("the .claude/skills tree in eslint.config.mjs", () => {
  // Every path here is `.mjs` on purpose. ESLint answers `isPathIgnored: true`
  // for anything no flat-config entry matches, so a `.md` or `.py` probe comes
  // back ignored whether or not the ignore list mentions it — see the last case
  // in this block, which pins that behavior so the trap stays visible.
  it.each([
    ["a file directly under .claude/skills", ".claude/skills/top-level.mjs"],
    ["a file in a skill directory", `${skill}/scripts/survey-prs.mjs`],
    ["a nested file in a skill", `${skill}/lib/nested/helper.mjs`],
  ])("lints %s", async (_label, relative) => {
    expect(await ignoredByEslint(relative)).toBe(false);
  });

  it("applies the automation rules to a skill's bundled script", async () => {
    const config = (await eslint.calculateConfigForFile(
      path.join(repoRoot, `${skill}/scripts/survey-prs.mjs`),
    )) as EffectiveConfig;
    expect(ruleSeverity(config.rules?.["no-console"])).toBe(0);
  });

  it("still ignores a worktree checkout", async () => {
    expect(await ignoredByEslint(`${worktrees}branch/scripts/x.mjs`)).toBe(true);
  });

  it("reports any path it has no configuration for as ignored", async () => {
    // Why the cases above are restricted to `.mjs`: this file is under the
    // linted source tree and would still answer `true` on an empty ignore list.
    await expect(ignoredByEslint(`${skill}/SKILL.md`)).resolves.toBe(true);
  });
});

describe("the platform-only console boundary in eslint.config.mjs", () => {
  async function noConsole(relative: string): Promise<RuleSetting | undefined> {
    const config = (await eslint.calculateConfigForFile(
      path.join(repoRoot, relative),
    )) as EffectiveConfig;
    return config.rules?.["no-console"];
  }

  // Both settings are severity 2, so the `allow` option is what tells the
  // platform adapter apart from everything else.
  it.each([
    ["the platform adapter", "apps/web/src/platform/crazygames.ts"],
    ["a nested platform module", "apps/web/src/platform/sdk/loader.ts"],
  ])("allows only console.warn and console.debug in %s", async (_label, relative) => {
    const setting = await noConsole(relative);
    expect(ruleSeverity(setting)).toBe(2);
    expect(Array.isArray(setting) ? setting[1] : undefined).toEqual({
      allow: ["warn", "debug"],
    });
  });

  it.each([
    ["the web entry", "apps/web/src/main.ts"],
    ["a web module outside platform/", "apps/web/src/game-info.ts"],
    ["the core entry", "packages/core/src/index.ts"],
  ])("rejects every console call in %s", async (_label, relative) => {
    const setting = await noConsole(relative);
    expect(ruleSeverity(setting)).toBe(2);
    // ESLint reports the rule's default options as an empty object.
    expect(readKey(Array.isArray(setting) ? setting[1] : undefined, "allow")).toBe(
      undefined,
    );
  });
});

describe("workspace build output in eslint.config.mjs", () => {
  // A lint run after `pnpm build` must not read bundled or emitted code, which
  // no tsconfig includes and nobody wrote.
  it.each(["apps/web/dist/", ".package/crazygames/", ".tsbuild/core/"])(
    "ignores %s",
    async (entry) => {
      expect(await ignoredByEslint(`${entry}probe.mjs`)).toBe(true);
    },
  );

  it.each([".tsbuild/", ".package/"])(
    "keeps %s out of git and Prettier",
    async (entry) => {
      const gitignore = readFileSync(path.join(repoRoot, ".gitignore"), "utf8").split(
        "\n",
      );
      expect(gitignore).toContain(entry);
      expect(await ignoredByPrettier(`${entry}probe.mjs`)).toBe(true);
    },
  );

  it("still lints workspace source", async () => {
    expect(await ignoredByEslint("apps/web/src/main.ts")).toBe(false);
    expect(await ignoredByEslint("packages/core/src/index.ts")).toBe(false);
  });
});

describe("the .claude source trees in .prettierignore", () => {
  // Prettier's `ignored` reflects the ignore file alone — whether it knows a
  // parser for the extension is a separate field — so any path discriminates.
  it.each([
    ["a file directly under .claude/skills", ".claude/skills/top-level.mjs"],
    ["a Markdown file in a skill", `${skill}/SKILL.md`],
    ["a nested reference in a skill", `${skill}/references/failure-modes.md`],
    ["a path-scoped rule", ".claude/rules/tests.md"],
  ])("formats %s", async (_label, relative) => {
    expect(await ignoredByPrettier(relative)).toBe(false);
  });

  it("still ignores a worktree checkout", async () => {
    expect(await ignoredByPrettier(`${worktrees}branch/README.md`)).toBe(true);
  });

  it("ignores the invalid JSON fixture", async () => {
    expect(await ignoredByPrettier(`${fixtures}broken.json`)).toBe(true);
  });
});

/**
 * Pull the quoted entries out of `typos.toml`'s `[files].extend-exclude`
 * array. Not a general TOML parser — the array is a flat list of quoted
 * strings, same shape as `scripts/lib/labels-manifest.mjs`'s hand-rolled
 * scanner for `.github/labels.yml`, for the same reason: a dependency is a
 * bigger cost than a few lines of line scanning for a fixed, small shape.
 */
function typosExtendExclude(): string[] {
  const text = readFileSync(path.join(repoRoot, "typos.toml"), "utf8");
  const match = /extend-exclude\s*=\s*\[([\s\S]*?)\]/.exec(text);
  const body = match?.[1] ?? "";
  return [...body.matchAll(/"([^"]+)"/g)].map((entry) => entry[1] ?? "");
}

describe("the generated/ignored tree stays consistent across tooling", () => {
  // Build/doc output nobody commits: .gitignore keeps it out of git
  // entirely, so there is nothing in it for ESLint, Prettier, or typos to
  // usefully check either.
  const BUILD_OUTPUT = ["dist/", "coverage/"];

  // `.claude/skills/` is tracked, hand-authored source: neither gitignored
  // nor excluded from typos.
  const SKILLS = ".claude/skills/";

  const gitignoreLines = readFileSync(path.join(repoRoot, ".gitignore"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
  const typosExclude = typosExtendExclude();

  it.each(BUILD_OUTPUT)(
    "%s is ignored by git, ESLint, Prettier, and typos alike",
    async (entry) => {
      expect(gitignoreLines).toContain(entry);
      expect(await ignoredByEslint(`${entry}probe.mjs`)).toBe(true);
      expect(await ignoredByPrettier(`${entry}probe.mjs`)).toBe(true);
      expect(typosExclude).toContain(entry);
    },
  );

  it("keeps .package/ gitignored and lists no output of the removed npm gates", () => {
    const prettierLines = readFileSync(path.join(repoRoot, ".prettierignore"), "utf8")
      .split("\n")
      .map((line) => line.trim());
    expect(gitignoreLines).toContain(".package/");
    // Spelled in two halves so a repository-wide search for the removed tool
    // finds nothing, the same way LEGACY_RELEASE_DIRECTORY is spelled.
    for (const removed of [".smoke/", ".at" + "tw/", "docs/api/"]) {
      expect(gitignoreLines).not.toContain(removed);
      expect(prettierLines).not.toContain(removed);
    }
  });

  it("does not gitignore the tracked .claude/skills tree", () => {
    expect(gitignoreLines).not.toContain(SKILLS);
  });

  it("spell-checks .claude/skills rather than excluding it from typos", () => {
    expect(typosExclude).not.toContain(SKILLS);
  });

  it("excludes test fixtures from typos", () => {
    expect(typosExclude).toContain(fixtures);
  });

  // A file lands there because it is malformed, deliberately failing, or
  // written for another toolchain. All five tools are asserted together so they
  // cannot drift apart.
  describe("tests/fixtures/ is data under test for every tool", () => {
    it("is not linted by ESLint", async () => {
      expect(await ignoredByEslint(`${fixtures}project/src/leaky.ts`)).toBe(true);
    });

    it("is not formatted by Prettier", async () => {
      expect(await ignoredByPrettier(`${fixtures}project/src/leaky.ts`)).toBe(true);
    });

    it("is not type-checked by TypeScript, while the rest of tests/ still is", () => {
      const workspace = mkdtempSync(path.join(tmpdir(), "tsconfig-fixtures-glob-"));
      try {
        mkdirSync(path.join(workspace, "tests/fixtures/project"), { recursive: true });
        writeFileSync(
          path.join(workspace, "tests/fixtures/project/broken.ts"),
          "export const wrong: number = 'not a number';\n",
        );
        writeFileSync(path.join(workspace, "tests/real.test.ts"), "export {};\n");

        const parsed = ts.parseJsonConfigFileContent(
          { include: ["tests"], exclude: excludeSpec() },
          ts.sys,
          workspace,
        );
        const found = new Set(
          parsed.fileNames.map((file) =>
            path.relative(workspace, file).replace(/\\/g, "/"),
          ),
        );

        expect(found.has("tests/fixtures/project/broken.ts")).toBe(false);
        expect(found.has("tests/real.test.ts")).toBe(true);
      } finally {
        rmSync(workspace, { recursive: true, force: true });
      }
    });

    it("is not collected as a test by the unit Vitest project", () => {
      expect(unitProjectExclude()).toContain(`${fixtures}**`);
    });
  });

  it("dropped the stale .rehearsal/ entry now that publish-rehearsal.mjs is gone", () => {
    expect(gitignoreLines).not.toContain(".rehearsal/");
  });
});

// Read by the fixtures block above and the tsconfig block below.
const configFile = ts.readConfigFile(path.join(repoRoot, "tsconfig.json"), (file) =>
  ts.sys.readFile(file),
);

function excludeSpec(): readonly string[] {
  const config: unknown = configFile.config;
  const exclude =
    typeof config === "object" && config !== null && "exclude" in config
      ? config.exclude
      : undefined;
  if (
    !Array.isArray(exclude) ||
    !exclude.every((entry): entry is string => typeof entry === "string")
  ) {
    throw new TypeError("tsconfig.json's exclude must be an array of strings");
  }
  return exclude;
}

describe("the .claude/skills entry in tsconfig.json", () => {
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, repoRoot);
  const resolved = new Set(
    parsed.fileNames.map((file) => path.relative(repoRoot, file).replace(/\\/g, "/")),
  );

  it("type-checks a skill's bundled script", () => {
    expect(resolved.has(`${skill}/scripts/survey-prs.mjs`)).toBe(true);
  });

  it("names .claude/skills in include and excludes only the fixtures", () => {
    const config: unknown = configFile.config;
    const include =
      typeof config === "object" && config !== null && "include" in config
        ? config.include
        : undefined;
    expect(include).toContain(".claude/skills");
    expect(excludeSpec()).toEqual(["tests/fixtures/**"]);
  });
});

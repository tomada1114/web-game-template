import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import consoleModule from "node:console";
import process from "node:process";

import { format, getFileInfo, resolveConfig } from "prettier";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BootstrapError,
  bootstrap,
  escapeHtml,
  findPlaceholders,
  main,
  normalizeRelativePath,
  parseArguments,
  promptArguments,
  validatePackageName,
  validateTitle,
} from "../scripts/bootstrap.mjs";
import { copyTemplate as copyTrackedFiles } from "../scripts/verify-bootstrap.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const LEGACY_RELEASE_DIRECTORY = ".change" + "set";
const workspaces: string[] = [];

// The suite itself runs from a git hook (`lefthook.yml` runs `test:related` on
// pre-commit), and git hands a hook GIT_DIR and, for a partial
// `git commit -- <path>`, GIT_INDEX_FILE. `scripts/check-staged.mjs`
// is meant to honor those — it is the pre-commit layer. Here they must go, or
// the fixture repositories below are built inside the checkout this suite is
// running in. See scripts/lib/git-env.mjs.
function clearGitEnvironment(): void {
  for (const name of Object.keys(process.env)) {
    if (name.startsWith("GIT_")) {
      vi.stubEnv(name, undefined);
    }
  }
}

beforeEach(clearGitEnvironment);

function copyTemplate(): string {
  const workspace = mkdtempSync(path.join(tmpdir(), "typescript-template-test-"));
  workspaces.push(workspace);
  copyTrackedFiles(workspace, repoRoot);
  const binary = path.join(workspace, "tests", "fixtures", "binary.dat");
  mkdirSync(path.dirname(binary), { recursive: true });
  writeFileSync(
    binary,
    Buffer.from([0, 255, 1, 2, 109, 121, 45, 112, 97, 99, 107, 97, 103, 101]),
  );

  return workspace;
}

function relativeFiles(root: string, directory: string): string[] {
  const files: string[] = [];
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else {
        files.push(path.relative(root, absolute));
      }
    }
  };
  visit(path.join(root, directory));
  return files.sort();
}

function allFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) {
        continue;
      }
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else {
        files.push(absolute);
      }
    }
  };
  visit(root);
  return files;
}

// Generalizes #103's single-file instruction-file byte-identity assertion: every
// text file Prettier would touch in a real, generated repository must
// already be in the shape `prettier --check .` expects, or a forker's first
// `pnpm check:quick` fails on a file they never edited (see #111). Honors
// the generated tree's own `.gitignore`/`.prettierignore` and Prettier's
// parser inference exactly the way the `prettier` CLI does, so build output,
// generated sub-agent definitions, and binary fixtures are skipped the same
// way `pnpm format:check` skips them.
async function assertGeneratedTreeIsFormatted(root: string): Promise<void> {
  const ignorePath = [".gitignore", ".prettierignore"]
    .map((name) => path.join(root, name))
    .filter((candidate) => existsSync(candidate));
  for (const absolute of allFiles(root)) {
    const info = await getFileInfo(absolute, { ignorePath });
    if (info.ignored || info.inferredParser === null) {
      continue;
    }
    const buffer = readFileSync(absolute);
    if (buffer.includes(0)) {
      continue;
    }
    const original = buffer.toString("utf8");
    const formatted = await format(original, {
      ...(await resolveConfig(absolute)),
      filepath: absolute,
    });
    expect(formatted, `${path.relative(root, absolute)} is not Prettier-clean`).toBe(
      original,
    );
  }
}

function aiLayerFiles(root: string): string[] {
  return ["CLAUDE.md", ...relativeFiles(root, ".claude")];
}

function options(
  packageName: string,
  title = "Acme Game",
): ReturnType<typeof parseArguments> {
  return parseArguments([
    packageName,
    "--title",
    title,
    "--author",
    "Ada Lovelace",
    "--github-user",
    "ada",
    "--license",
    "MIT",
  ]);
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe("bootstrap validation", () => {
  // The slug also scopes the workspace packages (`@<slug>/core`), so a scope
  // of its own, or anything outside lowercase kebab case, is refused.
  it.each([
    ["", "ERR_PACKAGE_NAME_EMPTY"],
    ["a".repeat(61), "ERR_PACKAGE_NAME_LENGTH"],
    ["Uppercase", "ERR_PACKAGE_NAME_CASE"],
    ["../evil", "ERR_PACKAGE_NAME_INVALID"],
    ["@scope/name", "ERR_PACKAGE_NAME_INVALID"],
    ["name with spaces", "ERR_PACKAGE_NAME_INVALID"],
    ["node_modules", "ERR_PACKAGE_NAME_INVALID"],
    ["dotted.name", "ERR_PACKAGE_NAME_INVALID"],
    ["double--hyphen", "ERR_PACKAGE_NAME_INVALID"],
    ["-leading", "ERR_PACKAGE_NAME_INVALID"],
    ["trailing-", "ERR_PACKAGE_NAME_INVALID"],
  ])("rejects the slug %j with %s", (name, code) => {
    expect(() => validatePackageName(name)).toThrow(BootstrapError);
    expect(() => validatePackageName(name)).toThrow(new RegExp(`^${code}:`));
  });

  it.each(["a", "acme-game", "2048", "a".repeat(60)])("accepts the slug %j", (name) => {
    expect(() => validatePackageName(name)).not.toThrow();
  });

  it.each([
    ["", "ERR_TITLE_INVALID"],
    ["   ", "ERR_TITLE_INVALID"],
    [" Leading space", "ERR_TITLE_INVALID"],
    ["Trailing space ", "ERR_TITLE_INVALID"],
    ['Say "hi"', "ERR_TITLE_INVALID"],
    ["Back\\slash", "ERR_TITLE_INVALID"],
    ["Tab\tinside", "ERR_TITLE_INVALID"],
    ["Delete\u007f", "ERR_TITLE_INVALID"],
    ["Two  spaces", "ERR_TITLE_INVALID"],
    ["T".repeat(60), "ERR_TITLE_LENGTH"],
    // 59 columns raw, 71 once each `&` becomes `&amp;`.
    [`${"&".repeat(3)}${"T".repeat(56)}`, "ERR_TITLE_LENGTH"],
    ["ゲ".repeat(30), "ERR_TITLE_LENGTH"],
  ])("rejects the title %j with %s", (title, code) => {
    expect(() => validateTitle(title)).toThrow(BootstrapError);
    expect(() => validateTitle(title)).toThrow(new RegExp(`^${code}:`));
  });

  it.each(["Acme Game", "Tom & Jerry's <Big> Day", "T".repeat(59), "ゲ".repeat(29)])(
    "accepts the title %j",
    (title) => {
      expect(() => validateTitle(title)).not.toThrow();
    },
  );

  it("requires --title", () => {
    expect(() =>
      parseArguments([
        "acme-game",
        "--author",
        "Ada Lovelace",
        "--github-user",
        "ada",
        "--license",
        "MIT",
      ]),
    ).toThrow(/ERR_ARGUMENT_REQUIRED: --title is required/);
  });

  it("escapes the characters an HTML text node cannot hold literally", () => {
    expect(escapeHtml("Tom & Jerry's <Big> Day")).toBe(
      "Tom &amp; Jerry's &lt;Big&gt; Day",
    );
  });

  it("normalizes Windows separators without accepting traversal", () => {
    expect(normalizeRelativePath(".\\docs\\reference.md")).toBe("docs/reference.md");
    expect(() => validatePackageName("..\\evil")).toThrow(BootstrapError);
  });

  it("uses the default description when it is omitted", () => {
    const parsed = options("acme-library");
    expect(parsed.description).toBe("A TypeScript package.");
  });

  it("rejects repeated metadata options rather than silently overwriting them", () => {
    const argv = ["duplicate-options", "--author", "Ada", "--author", "Grace"];
    expect(() => parseArguments(argv)).toThrow(BootstrapError);
    expect(() => parseArguments(argv)).toThrow(/ERR_ARGUMENT_DUPLICATE/);
  });

  it("prints help without inspecting or changing a repository", () => {
    const result = spawnSync(
      process.execPath,
      [path.join(repoRoot, "scripts/bootstrap.mjs"), "--help"],
      {
        cwd: tmpdir(),
        encoding: "utf8",
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("--dry-run");
    expect(result.stdout).toContain("--title");
    expect(result.stdout).not.toMatch(/--(?:profile|cli|node-engines|email)\b/);
    expect(result.stderr).toBe("");
  });

  // The template has one shape now: no profile, no CLI choice, no published
  // Node floor and no author email to ask for.
  it.each([
    ["--profile", "node-library"],
    ["--cli", "yes"],
    ["--node-engines", ">=20"],
    ["--email", "ada@example.com"],
  ])("rejects the removed %s option as unknown", (flag, value) => {
    expect(() =>
      parseArguments([
        "acme-library",
        flag,
        value,
        "--author",
        "Ada Lovelace",
        "--github-user",
        "ada",
        "--license",
        "MIT",
      ]),
    ).toThrow(new RegExp(`ERR_ARGUMENT_UNKNOWN: unknown option: ${flag}`));
  });

  it("rejects a removed option given before the package name as unknown", () => {
    const result = spawnSync(
      process.execPath,
      [path.join(repoRoot, "scripts/bootstrap.mjs"), "--profile", "node-library"],
      {
        cwd: tmpdir(),
        encoding: "utf8",
      },
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("ERR_ARGUMENT_UNKNOWN: unknown option: --profile");
  });

  it("collects package metadata through the interactive prompts", async () => {
    const answers = [
      "interactive-package",
      "Interactive Game",
      "Ada Lovelace",
      "ada",
      "ISC",
      "An interactive package.",
    ];
    const prompts: string[] = [];
    const parsed = await promptArguments((prompt) => {
      prompts.push(prompt);
      return Promise.resolve(answers.shift() ?? "");
    });

    expect(parsed).toMatchObject({
      packageName: "interactive-package",
      title: "Interactive Game",
      author: "Ada Lovelace",
      githubUser: "ada",
      license: "ISC",
      description: "An interactive package.",
    });
    expect(prompts).toEqual([
      "Game slug: ",
      "Display title: ",
      "Author name: ",
      "GitHub user: ",
      "License [MIT]: ",
      "Description [A TypeScript package.]: ",
    ]);
  });

  it("uses interactive input when the command has no arguments", () => {
    const root = copyTemplate();
    const output = execFileSync(process.execPath, ["scripts/bootstrap.mjs"], {
      cwd: root,
      encoding: "utf8",
      input:
        ["interactive-package", "Interactive Game", "Ada Lovelace", "ada", "", ""].join(
          "\n",
        ) + "\n",
    });

    expect(output).toContain("Bootstrapped interactive-package.");
    expect(
      JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")),
    ).toMatchObject({
      name: "interactive-package",
      author: "Ada Lovelace",
      license: "MIT",
      description: "A TypeScript package.",
    });
    expect(
      readFileSync(path.join(root, "apps", "web", "src", "game-info.ts"), "utf8"),
    ).toContain('export const GAME_TITLE = "Interactive Game";');
  });

  it("rejects unknown options instead of silently ignoring them", () => {
    expect(() =>
      parseArguments([
        "acme-library",
        "--author",
        "Ada Lovelace",
        "--github-user",
        "ada",
        "--license",
        "MIT",
        "--typo",
        "value",
      ]),
    ).toThrow(/ERR_ARGUMENT_UNKNOWN/);
  });
});

describe("bootstrap generation", () => {
  it.each([
    [
      "a DOM global",
      'export const probe = document.createElement("div");\n',
      "document",
    ],
    ["a Node global", "export const probe = process.version;\n", "process"],
  ])("rejects %s in a generated repository's core", (_label, source, name) => {
    const root = copyTemplate();
    bootstrap(root, options("runtime-free-core"));
    writeFileSync(path.join(root, "packages", "core", "src", "probe.ts"), source);
    // Core imports nothing, so its program compiles without an install.
    const result = spawnSync(
      process.execPath,
      [path.join(repoRoot, "node_modules/typescript/bin/tsc"), "-p", "packages/core"],
      {
        cwd: root,
        encoding: "utf8",
      },
    );
    expect(result.status).toBe(2);
    expect(result.stdout).toContain(`Cannot find name '${name}'`);
  });

  it.each([
    ["acme-library", "Acme Library"],
    ["space-tiles", "Tom & Jerry's <Big> Day"],
  ])("generates %s titled %j", async (packageName, title) => {
    const root = copyTemplate();
    const binaryBefore = readFileSync(
      path.join(root, "tests", "fixtures", "binary.dat"),
    );
    const stableAiFiles = aiLayerFiles(root)
      .filter(
        (file) =>
          (file.startsWith(".claude/skills/") || file.startsWith(".claude/rules/")) &&
          // The bootstrap rule documents the bootstrap flow itself, so it
          // self-removes along with scripts/bootstrap.mjs (see
          // SELF_REMOVED_PATHS) rather than staying stable across a run.
          file !== ".claude/rules/bootstrap.md",
      )
      .map((file) => [file, readFileSync(path.join(root, file), "utf8")] as const);
    const coreConfigBefore = readFileSync(
      path.join(root, "packages", "core", "tsconfig.json"),
      "utf8",
    );
    bootstrap(root, options(packageName, title));

    const manifest = JSON.parse(
      readFileSync(path.join(root, "package.json"), "utf8"),
    ) as {
      name: string;
      version: string;
      author: string;
      packageManager?: string;
      dependencies?: Record<string, string>;
      bin?: Record<string, string>;
      devEngines: { runtime: { onFail: string } };
      engines?: Record<string, string>;
      sideEffects: false | string[];
      repository: { url: string };
    };
    expect(manifest.name).toBe(packageName);
    expect(manifest.version).toBe("0.0.0");
    expect(manifest.author).toBe("Ada Lovelace");
    // Corepack and Dependabot read this field and both need an exact version.
    expect(manifest.packageManager).toBe("pnpm@11.18.0");
    expect(manifest.devEngines.runtime.onFail).toBe("error");
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.repository.url).not.toContain("@acme/");
    expect(findPlaceholders(root)).toEqual([]);
    expect(readFileSync(path.join(root, "tests", "fixtures", "binary.dat"))).toEqual(
      binaryBefore,
    );
    expect(existsSync(path.join(root, LEGACY_RELEASE_DIRECTORY))).toBe(false);
    expect(readFileSync(path.join(root, "README.md"), "utf8")).not.toContain(
      "Use this template",
    );
    // Bootstrap's own script has nothing left to do in a generated repository
    // and is never referenced again, so it removes itself.
    expect(existsSync(path.join(root, "scripts", "bootstrap.mjs"))).toBe(false);
    // The rule documenting the bootstrap flow has nothing left to document
    // once that flow's own files are gone, so it self-removes too.
    expect(existsSync(path.join(root, ".claude", "rules", "bootstrap.md"))).toBe(false);
    // CLAUDE.md's template-only block names the bootstrap commands and rule;
    // it must go with them, or the generated memory file points at nothing.
    const generatedClaudeMd = readFileSync(path.join(root, "CLAUDE.md"), "utf8");
    expect(generatedClaudeMd).not.toContain("bootstrap:e2e");
    expect(generatedClaudeMd).not.toContain(".claude/rules/bootstrap.md");
    expect(readFileSync(path.join(root, "CONTRIBUTING.md"), "utf8")).not.toContain(
      "bootstrap:check",
    );
    const changelog = readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
    expect(changelog.match(/^## .*$/gm)).toEqual(["## [Unreleased]"]);
    expect(changelog.trimEnd().endsWith("## [Unreleased]")).toBe(true);
    expect(changelog).not.toContain("0.1.1");
    expect(changelog).toContain("Keep a Changelog");

    for (const [file, contents] of stableAiFiles) {
      expect(readFileSync(path.join(root, file), "utf8")).toBe(contents);
    }
    const dependabotSkillPath = path.join(
      root,
      ".claude",
      "skills",
      "merge-dependabot",
      "SKILL.md",
    );
    expect(existsSync(dependabotSkillPath)).toBe(true);
    const dependabotSkill = readFileSync(dependabotSkillPath, "utf8");
    expect(dependabotSkill).toContain(".github/PULL_REQUEST_TEMPLATE.md");
    expect(existsSync(path.join(root, ".github", "PULL_REQUEST_TEMPLATE.md"))).toBe(
      true,
    );
    expect(
      existsSync(path.join(root, ".github", "workflows", "check-pr-title.yml")),
    ).toBe(true);
    const workflow = readFileSync(
      path.join(root, ".github", "workflows", "ci.yml"),
      "utf8",
    );
    expect(workflow).not.toContain("bootstrap:e2e");
    expect(workflow).not.toContain("  package-floor:");
    expect(
      existsSync(
        path.join(
          root,
          ".claude",
          "skills",
          "merge-dependabot",
          "scripts",
          "survey-prs.mjs",
        ),
      ),
    ).toBe(true);
    expect(existsSync(path.join(root, "scripts", "lib", "is-main.mjs"))).toBe(true);
    expect(existsSync(path.join(root, "scripts", "lib", "json.mjs"))).toBe(true);

    expect(manifest.bin).toBeUndefined();
    expect(manifest.sideEffects).toBe(false);

    // The slug scopes both workspace packages, and the lockfile records the
    // workspace dependency under that same name, or a frozen install fails.
    const workspaceName = (relative: string): unknown =>
      (JSON.parse(readFileSync(path.join(root, relative), "utf8")) as { name: unknown })
        .name;
    expect(workspaceName("packages/core/package.json")).toBe(`@${packageName}/core`);
    expect(workspaceName("apps/web/package.json")).toBe(`@${packageName}/web`);
    expect(
      JSON.parse(readFileSync(path.join(root, "apps", "web", "package.json"), "utf8")),
    ).toMatchObject({ dependencies: { [`@${packageName}/core`]: "workspace:*" } });
    const lockfile = readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8");
    expect(lockfile).toContain(`'@${packageName}/core':`);
    expect(lockfile).not.toContain("@my-game/");
    // A module importing core by its scoped name must follow the rename, or its
    // import no longer resolves and the typed lint rules fail on it.
    for (const relative of [
      "apps/web/src/scenes/PlayScene.ts",
      "apps/web/src/view/board-view.ts",
      "apps/web/test/view/board-view.test.ts",
    ]) {
      const source = readFileSync(path.join(root, relative), "utf8");
      expect(source).toContain(`from "@${packageName}/core";`);
      expect(source).not.toContain("@my-game/");
    }

    const gameInfo = readFileSync(
      path.join(root, "apps", "web", "src", "game-info.ts"),
      "utf8",
    );
    expect(gameInfo).toContain(`export const GAME_SLUG = "${packageName}";`);
    expect(gameInfo).toContain(`export const GAME_TITLE = "${title}";`);
    expect(
      readFileSync(path.join(root, "apps", "web", "index.html"), "utf8"),
    ).toContain(`<title>${escapeHtml(title)}</title>`);

    // One shape: the core program and the Node floor are the template's own.
    expect(
      readFileSync(path.join(root, "packages", "core", "tsconfig.json"), "utf8"),
    ).toBe(coreConfigBefore);
    expect(manifest.engines).toEqual({ node: ">=24" });

    // A `template-only` block at end of file (see #111) or a re-padded
    // Markdown table (see #103) both leave the generated tree failing its
    // own first `pnpm check:quick`. Check every generated text file against
    // Prettier itself, not a hand-picked one.
    await assertGeneratedTreeIsFormatted(root);
  });

  // #113: bootstrap does a literal string substitution of the template's
  // placeholders, not a re-format, so a value long enough to push a line past
  // Prettier's printWidth leaves the generated tree failing its own
  // `pnpm format:check`. `GAME_SLUG` and `GAME_TITLE` in
  // apps/web/src/game-info.ts are the tightest lines; this exercises both at
  // the longest value bootstrap accepts, the title once in ASCII and once in
  // characters Prettier counts as two columns.
  it.each([
    ["an ASCII title", "T".repeat(59)],
    ["a wide-character title", "ゲ".repeat(29)],
    // 59 columns raw and 69, the index.html limit, once escaped.
    ["a title that grows when escaped", `&<${"T".repeat(56)}>`],
  ])(
    "keeps the generated tree Prettier-clean for the longest slug and %s",
    async (_label, title) => {
      const root = copyTemplate();
      bootstrap(root, options("a".repeat(60), title));
      expect(findPlaceholders(root)).toEqual([]);
      await assertGeneratedTreeIsFormatted(root);
    },
  );

  it("rewrites only explicit targets", () => {
    const root = copyTemplate();
    const untouched = path.join(root, "unlisted-placeholder.txt");
    writeFileSync(untouched, "my-game My Game");

    bootstrap(root, options("explicit-library"));

    expect(readFileSync(untouched, "utf8")).toBe("my-game My Game");
    expect(findPlaceholders(root)).toEqual([]);
  });

  it("makes dry-run non-mutating", () => {
    const root = copyTemplate();
    const before = readFileSync(path.join(root, "package.json"), "utf8");
    const changed = bootstrap(root, {
      ...options("dry-library"),
      dryRun: true,
    });
    expect(changed.length).toBeGreaterThan(0);
    expect(readFileSync(path.join(root, "package.json"), "utf8")).toBe(before);
  });

  it("validates projected dry-run output without mutating the source", () => {
    const root = copyTemplate();
    const claudeMd = path.join(root, "CLAUDE.md");
    writeFileSync(
      claudeMd,
      `${readFileSync(claudeMd, "utf8")}\nThis reference must be rejected: <!-- template-only:start -->\n`,
    );
    const before = readFileSync(claudeMd, "utf8");

    expect(() =>
      bootstrap(root, {
        ...options("invalid-dry-run"),
        dryRun: true,
      }),
    ).toThrow(/ERR_AI_LAYER_REFERENCE/);
    expect(readFileSync(claudeMd, "utf8")).toBe(before);
  });

  it("rejects a Markdown reference to a path the generated tree does not contain", () => {
    const root = copyTemplate();
    const claudeMd = path.join(root, "CLAUDE.md");
    writeFileSync(
      claudeMd,
      `${readFileSync(claudeMd, "utf8")}\nSee \`scripts/does-not-exist.mjs\` for details.\n`,
    );

    expect(() => bootstrap(root, options("dangling-reference"))).toThrow(
      /CLAUDE\.md: dangling reference `scripts\/does-not-exist\.mjs`/,
    );
  });

  it("does not treat an ESLint config block name in inline code as a path", () => {
    // A flat-config block name has exactly the shape of a repo-relative path,
    // so naming the gate that enforces a rule used to fail the build (#102).
    // The first segment is what separates the two: the generated root has no
    // `public-api` entry, so the token is not a path to resolve at all.
    const root = copyTemplate();
    const claudeMd = path.join(root, "CLAUDE.md");
    writeFileSync(
      claudeMd,
      `${readFileSync(claudeMd, "utf8")}\nThe \`public-api/internal-stays-private\` block enforces it.\n`,
    );

    expect(() => bootstrap(root, options("eslint-block-name"))).not.toThrow();
  });

  it("still rejects a Markdown reference to a path bootstrap itself removes", () => {
    // The narrowing above must not cost the check the case it exists for. A
    // removed file sits inside a directory that survives the removal, so its
    // first segment still resolves and the dry-run preview still reports it.
    const root = copyTemplate();
    const claudeMd = path.join(root, "CLAUDE.md");
    writeFileSync(
      claudeMd,
      `${readFileSync(claudeMd, "utf8")}\nSee \`scripts/bootstrap.mjs\` for details.\n`,
    );

    expect(() => bootstrap(root, options("removed-reference"))).toThrow(
      /CLAUDE\.md: dangling reference `scripts\/bootstrap\.mjs`/,
    );
  });

  it("does not treat a backticked schemeless URL as a dangling path (#108)", () => {
    // `github.com/owner/repo/blob/main/README.md` has no `://`, has a `/`,
    // and its last segment (`README.md`) has a dot — so #106's shape rule 3
    // would classify it as a repository path before the filesystem is ever
    // consulted, and it would be reported as dangling even though it is
    // ordinary Markdown prose naming a schemeless URL. The first segment
    // (`github.com`) is hostname-shaped — a dot at an interior index — so it
    // must be excluded from the token set entirely, in both a built checkout
    // and a fresh `git ls-files` tree.
    const root = copyTemplate();
    const claudeMd = path.join(root, "CLAUDE.md");
    writeFileSync(
      claudeMd,
      `${readFileSync(claudeMd, "utf8")}\nSee \`github.com/owner/repo/blob/main/README.md\` for details.\n`,
    );

    expect(() => bootstrap(root, options("schemeless-url"))).not.toThrow();
  });

  it("does not treat a backticked bare extensionless hostname as a dangling path (#108)", () => {
    // The interior-dot test on the first segment fires regardless of the
    // last segment's extension, so `example.com/path` (no `://`, no dot in
    // the last segment) is excluded by the same rule as the extensioned
    // case above — no separate carve-out needed.
    const root = copyTemplate();
    const claudeMd = path.join(root, "CLAUDE.md");
    writeFileSync(
      claudeMd,
      `${readFileSync(claudeMd, "utf8")}\nSee \`example.com/path\` for details.\n`,
    );

    expect(() => bootstrap(root, options("bare-hostname"))).not.toThrow();
  });

  it("still classifies `.claude/settings.local.json` as a path, not as hostname-shaped (#108)", () => {
    // The dot in `.claude` sits at index 0, not an interior index, so the
    // hostname test must not exclude it: it stays a path token, and stays
    // exempt via DANGLING_REFERENCE_EXEMPTIONS rather than being dropped from
    // the token set outright. This pins the distinction between "excluded"
    // (never becomes a token) and "exempt" (becomes a token, then allowed).
    const root = copyTemplate();
    const claudeMd = path.join(root, "CLAUDE.md");
    writeFileSync(
      claudeMd,
      `${readFileSync(claudeMd, "utf8")}\nSee \`.claude/settings.local.json\` for details.\n`,
    );

    expect(() => bootstrap(root, options("dotfile-exempt"))).not.toThrow();
  });

  it("still reports a dangling reference under a multi-dot dotfile first segment (#108)", () => {
    // `.prettierrc.json` has two dots, and the first one sits at index 0 —
    // a dotfile, not a hostname. A hostname test that inspects the *last*
    // dot instead of the first would see the interior dot before `.json`,
    // misclassify the first segment as hostname-shaped, and drop the token
    // before the dangling-reference check ever runs — silently hiding an
    // obviously bogus reference into a file that cannot have a subpath.
    const root = copyTemplate();
    const claudeMd = path.join(root, "CLAUDE.md");
    writeFileSync(
      claudeMd,
      `${readFileSync(claudeMd, "utf8")}\nSee \`.prettierrc.json/overrides\` for details.\n`,
    );

    expect(() => bootstrap(root, options("multi-dot-dotfile"))).toThrow(
      /CLAUDE\.md: dangling reference `\.prettierrc\.json\/overrides`/,
    );
  });

  it.each([
    ["absent", false],
    ["present", true],
  ] as const)(
    "reports a dangling reference under a gitignored build directory whether or not that directory is %s in the checkout (#106)",
    (_label, createDistDirectory) => {
      // `dist/` is gitignored build output (`pnpm build`): it exists in a
      // developer checkout that has built it and does not exist in a fresh
      // clone or the git-ls-files-based fixture this suite normally builds.
      // A dangling reference under it must be reported either way — the
      // filename has an extension, so shape (rule 3) classifies it as a path
      // before the filesystem is ever consulted.
      const root = copyTemplate();
      if (createDistDirectory) {
        mkdirSync(path.join(root, "dist"), { recursive: true });
      }
      const claudeMd = path.join(root, "CLAUDE.md");
      writeFileSync(
        claudeMd,
        `${readFileSync(claudeMd, "utf8")}\nSee \`dist/getting-started.md\` for details.\n`,
      );

      expect(() =>
        bootstrap(root, options(`dist-dangling-${String(createDistDirectory)}`)),
      ).toThrow(
        /ERR_AI_LAYER_REFERENCE[\s\S]*CLAUDE\.md: dangling reference `dist\/getting-started\.md`/,
      );
    },
  );

  it.each([
    ["absent", false],
    ["present", true],
  ] as const)(
    "skips every dangling-reference exemption, under either trailing-slash spelling, whether the target directory is %s (#106)",
    (_label, createDistDirectory) => {
      const root = copyTemplate();
      if (createDistDirectory) {
        mkdirSync(path.join(root, "dist"), { recursive: true });
      }
      const claudeMd = path.join(root, "CLAUDE.md");
      writeFileSync(
        claudeMd,
        `${readFileSync(claudeMd, "utf8")}\n` +
          "Exempt references: `dist`, `dist/`, `docs/`, `apps/web/dist/`, " +
          "`.claude/settings.local.json`, `secrets/`.\n",
      );

      expect(() =>
        bootstrap(root, options(`dist-exempt-${String(createDistDirectory)}`)),
      ).not.toThrow();
    },
  );

  it("leaves the repository untouched when a real (non-dry-run) bootstrap fails validation", () => {
    // transform() removes its own script and rewrites package.json before any
    // validation runs. If bootstrap() validated against the already-written
    // result instead of a preview, a validation failure here would delete
    // scripts/bootstrap.mjs and rename package.json with no way to recover.
    const root = copyTemplate();
    const claudeMd = path.join(root, "CLAUDE.md");
    const before = readFileSync(claudeMd, "utf8");
    writeFileSync(
      claudeMd,
      `${before}\nSee \`scripts/does-not-exist.mjs\` for details.\n`,
    );
    const packageJsonBefore = readFileSync(path.join(root, "package.json"), "utf8");

    expect(() => bootstrap(root, options("untouched-on-failure"))).toThrow(
      BootstrapError,
    );

    expect(existsSync(path.join(root, "scripts", "bootstrap.mjs"))).toBe(true);
    expect(readFileSync(path.join(root, "package.json"), "utf8")).toBe(
      packageJsonBefore,
    );
  });

  function appendToClaudeMd(root: string, line: string): void {
    const claudeMd = path.join(root, "CLAUDE.md");
    writeFileSync(claudeMd, `${readFileSync(claudeMd, "utf8")}\n${line}\n`);
  }

  function shapeDotGit(root: string, shape: "file" | "directory" | "absent"): void {
    // In a linked worktree `.git` is a file, so its first segment exists
    // while `.git/config` does not.
    if (shape === "file") {
      writeFileSync(path.join(root, ".git"), "gitdir: /elsewhere/.git/worktrees/x\n");
    } else if (shape === "directory") {
      mkdirSync(path.join(root, ".git"));
    }
  }

  it.each(["file", "directory", "absent"] as const)(
    "does not report `.git/config` as dangling when .git is %s at the root (#20)",
    (shape) => {
      const root = copyTemplate();
      shapeDotGit(root, shape);
      appendToClaudeMd(root, "Edit `.git/config`.");

      expect(() => bootstrap(root, options(`git-config-${shape}`))).not.toThrow();
    },
  );

  it("does not report `.git/config` as dangling in a dry run from a linked worktree (#20)", () => {
    const root = copyTemplate();
    shapeDotGit(root, "file");
    appendToClaudeMd(root, "Edit `.git/config`.");

    expect(() =>
      bootstrap(root, { ...options("git-config-dry-run"), dryRun: true }),
    ).not.toThrow();
  });

  it.each([
    ["a leading ./", "./.git/config"],
    ["a different case", ".GIT/config"],
    ["a skipped directory with a file extension", "node_modules/vite/package.json"],
  ])("does not report a skipped-directory token written with %s", (_label, token) => {
    const root = copyTemplate();
    shapeDotGit(root, "file");
    appendToClaudeMd(root, `See \`${token}\`.`);

    expect(() => bootstrap(root, options("skipped-directory-token"))).not.toThrow();
  });

  it("does not scan a gitignored worktree checkout for dangling Markdown references", () => {
    // .claude/worktrees/ holds full checkouts (see .gitignore); a bootstrap
    // run against a real, non-fresh checkout must not fail because of
    // unrelated content sitting in one.
    const root = copyTemplate();
    const worktreeDirectory = path.join(root, ".claude", "worktrees", "some-branch");
    mkdirSync(worktreeDirectory, { recursive: true });
    writeFileSync(
      path.join(worktreeDirectory, "NOTES.md"),
      "See `scripts/only-in-worktree.mjs` for details.\n",
    );

    expect(() => bootstrap(root, options("worktree-ignored"))).not.toThrow();
  });

  it.each(["docs/product", "docs/design"])(
    "does not scan planning records under %s/ for dangling Markdown references",
    (directory) => {
      const root = copyTemplate();
      const planningDirectory = path.join(root, ...directory.split("/"));
      mkdirSync(planningDirectory, { recursive: true });
      writeFileSync(
        path.join(planningDirectory, "plan.md"),
        "Later work creates `src/not-yet-created.ts`.\n",
      );

      expect(() => bootstrap(root, options("planning-record-skip"))).not.toThrow();
    },
  );

  it.each(["docs/notes.md", "README.md"])(
    "still reports a dangling reference in %s outside the planning-record paths",
    (file) => {
      const root = copyTemplate();
      const target = path.join(root, ...file.split("/"));
      mkdirSync(path.dirname(target), { recursive: true });
      const before = existsSync(target) ? readFileSync(target, "utf8") : "";
      writeFileSync(
        target,
        `${before}\nLater work creates \`src/not-yet-created.ts\`.\n`,
      );

      expect(() => bootstrap(root, options("planning-record-scanned"))).toThrow(
        /dangling reference `src\/not-yet-created\.ts`/,
      );
    },
  );

  it("does not let a nested, unrelated file sharing an AI-layer basename affect the AI-layer check", () => {
    // AI_LAYER_TARGETS matches exact repository-relative paths, not a
    // basename at any depth (fixed in #71). A stray bootstrap marker in a
    // nested file that happens to share the top-level CLAUDE.md's name must
    // not fail bootstrap, because that nested file is never a generated
    // repository's AI-layer instructions.
    const root = copyTemplate();
    const nestedDirectory = path.join(root, "docs", "guides");
    mkdirSync(nestedDirectory, { recursive: true });
    writeFileSync(
      path.join(nestedDirectory, "CLAUDE.md"),
      "# Unrelated guide\n\n" +
        "<!-- template-only:start -->\n" +
        "A stale marker a basename-only match would have wrongly flagged.\n" +
        "<!-- template-only:end -->\n",
    );

    expect(() => bootstrap(root, options("nested-basename"))).not.toThrow();
  });

  it("does not depend on package-manager or staging processes", () => {
    const source = readFileSync(
      path.join(repoRoot, "scripts", "bootstrap.mjs"),
      "utf8",
    );

    expect(source).not.toContain('from "node:child_process"');
    expect(source).not.toContain("spawnSync");
    expect(source).not.toContain("mkdtempSync");
    expect(source).not.toContain("regenerateLockfile");
    expect(source).not.toContain("corepack");
  });

  it("preserves interactive metadata in generated JSON", () => {
    const root = copyTemplate();
    const description = 'A $& "quoted" package.\nWith a second line.';
    const parsed = parseArguments([
      "quoted-package",
      "--title",
      "Quoted Game",
      "--author",
      'Ada "The Great"',
      "--github-user",
      "ada",
      "--license",
      "MIT",
      "--description",
      description,
    ]);

    bootstrap(root, parsed);

    const manifest = JSON.parse(
      readFileSync(path.join(root, "package.json"), "utf8"),
    ) as { author: string; description: string };
    expect(manifest).toMatchObject({
      author: 'Ada "The Great"',
      description,
    });
    expect(readFileSync(path.join(root, "README.md"), "utf8")).toContain(description);
  });

  it("keeps package metadata and the license text in sync", () => {
    const root = copyTemplate();
    const isc = parseArguments([
      "licensed-package",
      "--title",
      "Licensed Game",
      "--author",
      "Ada Lovelace",
      "--github-user",
      "ada",
      "--license",
      "ISC",
    ]);
    bootstrap(root, isc, { year: 2030 });
    const manifest = JSON.parse(
      readFileSync(path.join(root, "package.json"), "utf8"),
    ) as { license: string };
    expect(manifest.license).toBe("ISC");
    expect(readFileSync(path.join(root, "LICENSE"), "utf8")).toContain(
      'THE SOFTWARE IS PROVIDED "AS IS"',
    );
    expect(readFileSync(path.join(root, "LICENSE"), "utf8")).toContain(
      "Copyright 2030 Ada Lovelace",
    );
    expect(readFileSync(path.join(root, "README.md"), "utf8")).toContain(
      "[ISC](LICENSE)",
    );
  });

  it("uses the injected year in the generated MIT license", () => {
    const root = copyTemplate();
    bootstrap(root, options("mit-package"), { year: 2042 });

    expect(readFileSync(path.join(root, "LICENSE"), "utf8")).toContain(
      "Copyright (c) 2042 Ada Lovelace",
    );
  });

  it("refuses a second run without changing generated files", () => {
    const root = copyTemplate();
    bootstrap(root, options("once-only"));
    const before = readFileSync(path.join(root, "package.json"), "utf8");
    expect(() => bootstrap(root, options("twice"))).toThrow(/ERR_ALREADY_BOOTSTRAPPED/);
    expect(readFileSync(path.join(root, "package.json"), "utf8")).toBe(before);
  });
});

describe("main", () => {
  function captureConsole(): { out: string[]; err: string[] } {
    const out: string[] = [];
    const err: string[] = [];
    vi.spyOn(consoleModule, "log").mockImplementation((line: unknown) => {
      out.push(String(line));
    });
    vi.spyOn(consoleModule, "error").mockImplementation((line: unknown) => {
      err.push(String(line));
    });
    return { out, err };
  }

  it.each(["--help", "-h"])("prints usage and exits 0 for %s", async (flag) => {
    const { out } = captureConsole();
    await expect(main([flag])).resolves.toBe(0);
    expect(out.join("\n")).toContain("Usage");
  });

  it("exits 2 with usage on a BootstrapError", async () => {
    const { err } = captureConsole();
    await expect(main(["Uppercase"])).resolves.toBe(2);
    expect(err.length).toBeGreaterThan(0);
  });

  it("exits 1 on an error that is not a BootstrapError", async () => {
    const { err } = captureConsole();
    const missing = path.join(tmpdir(), "bootstrap-main-missing-cwd");
    vi.spyOn(process, "cwd").mockReturnValue(missing);
    await expect(
      main([
        "acme-library",
        "--title",
        "Acme Game",
        "--author",
        "Ada Lovelace",
        "--github-user",
        "ada",
        "--license",
        "MIT",
      ]),
    ).resolves.toBe(1);
    expect(err.length).toBeGreaterThan(0);
  });

  it("reports a dry run without changing files", async () => {
    const root = copyTemplate();
    const before = readFileSync(path.join(root, "package.json"), "utf8");
    vi.spyOn(process, "cwd").mockReturnValue(root);
    const { out } = captureConsole();
    await expect(
      main([
        "dry-library",
        "--title",
        "Acme Game",
        "--author",
        "Ada Lovelace",
        "--github-user",
        "ada",
        "--license",
        "MIT",
        "--dry-run",
      ]),
    ).resolves.toBe(0);
    expect(out[0]).toMatch(/^Dry run: \d+ path\(s\) would change\.$/u);
    expect(out.some((line) => line.startsWith("- "))).toBe(true);
    expect(out.at(-1)).toBe("No repository files were changed.");
    expect(readFileSync(path.join(root, "package.json"), "utf8")).toBe(before);
  });

  it("reports a real run and the next command", async () => {
    const root = copyTemplate();
    vi.spyOn(process, "cwd").mockReturnValue(root);
    const { out } = captureConsole();
    await expect(
      main([
        "real-library",
        "--title",
        "Acme Game",
        "--author",
        "Ada Lovelace",
        "--github-user",
        "ada",
        "--license",
        "MIT",
      ]),
    ).resolves.toBe(0);
    expect(out[0]).toBe("Bootstrapped real-library.");
    expect(out.at(-1)).toBe(
      "Next: run `pnpm install --frozen-lockfile`, then `pnpm check`.",
    );
    expect(existsSync(path.join(root, "scripts", "bootstrap.mjs"))).toBe(false);
  });
});

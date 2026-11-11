import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import { afterEach, describe, expect, it } from "vitest";

import { isolatedGitEnv } from "../scripts/lib/git-env.mjs";
import { ORIGIN_FILE, TEMPLATE_URL } from "../scripts/bootstrap.mjs";
import {
  PRODUCT_PLACEHOLDER,
  assertCopyable,
  assertGenerated,
  checkGenerated,
  copyTemplate,
  main,
  run,
  writeProductFixture,
} from "../scripts/verify-bootstrap.mjs";

// This suite itself runs from a git hook (`lefthook.yml` runs `test:related`
// on pre-commit), and git hands a hook GIT_DIR. `copyTemplate` already spawns
// git through `isolatedGitEnv()`, but the fixture repositories below still
// call `git init`/`git add` directly, so those calls need the same isolation —
// see scripts/lib/git-env.mjs and tests/git-env.test.ts.
const directories: string[] = [];

/** A fresh, empty git repository to copy from, isolated from the surrounding one. */
function makeSourceRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "verify-bootstrap-source-"));
  directories.push(dir);
  execFileSync("git", ["init", "-q"], { cwd: dir, env: isolatedGitEnv() });
  return dir;
}

/** An empty directory to copy into. */
function makeDestination(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "verify-bootstrap-dest-"));
  directories.push(dir);
  return dir;
}

/** Stage a relative path in the fixture repository. */
function stage(source: string, relative: string): void {
  execFileSync("git", ["add", relative], { cwd: source, env: isolatedGitEnv() });
}

afterEach(() => {
  while (directories.length > 0) {
    const dir = directories.pop();
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("copyTemplate", () => {
  it("copies an ordinary tracked file", () => {
    const source = makeSourceRepo();
    const destination = makeDestination();
    writeFileSync(path.join(source, "kept.txt"), "hello\n");
    stage(source, "kept.txt");

    copyTemplate(destination, source);

    expect(readFileSync(path.join(destination, "kept.txt"), "utf8")).toBe("hello\n");
  });

  it("skips a stale index entry whose file was removed without a commit", () => {
    const source = makeSourceRepo();
    const destination = makeDestination();
    const removed = path.join(source, "removed.txt");
    writeFileSync(removed, "gone\n");
    stage(source, "removed.txt");
    rmSync(removed);

    expect(() => copyTemplate(destination, source)).not.toThrow();
    expect(existsSync(path.join(destination, "removed.txt"))).toBe(false);
  });

  it("refuses a tracked dangling symlink instead of silently skipping it", () => {
    const source = makeSourceRepo();
    const destination = makeDestination();
    symlinkSync("does-not-exist", path.join(source, "dangling-link"));
    stage(source, "dangling-link");

    expect(() => copyTemplate(destination, source)).toThrow(
      /ERR_BOOTSTRAP_UNSUPPORTED_ENTRY/,
    );
    expect(existsSync(path.join(destination, "dangling-link"))).toBe(false);
  });

  it("refuses a tracked symlink to a directory instead of throwing a bare EISDIR", () => {
    const source = makeSourceRepo();
    const destination = makeDestination();
    mkdirSync(path.join(source, "real-dir"));
    symlinkSync("real-dir", path.join(source, "link-to-dir"), "dir");
    stage(source, "link-to-dir");

    expect(() => copyTemplate(destination, source)).toThrow(
      /ERR_BOOTSTRAP_UNSUPPORTED_ENTRY/,
    );
  });

  // `git`'s own untracked-file walk drops a genuine socket before it ever
  // reaches `ls-files --others` (confirmed against the git this suite runs
  // under: neither `ls-files --others` nor `git add` will surface one), so
  // this exercises `assertCopyable` directly rather than through
  // `copyTemplate`. It reproduces the shape of the failure found while
  // shipping #67 — an untracked `.pnpm-store/` holding a unix socket, where
  // the old `existsSync` guard let a bare ENOTSUP take down the suite — for
  // whichever entry point a non-regular file does reach this check through.
  it.skipIf(process.platform === "win32")(
    "refuses a non-regular file such as a unix socket",
    async () => {
      const source = makeSourceRepo();
      const socketPath = path.join(source, "untracked.sock");
      const server = createServer();
      try {
        await new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen(socketPath, resolve);
        });

        expect(() => assertCopyable(socketPath, "untracked.sock")).toThrow(
          /ERR_BOOTSTRAP_UNSUPPORTED_ENTRY/,
        );
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
  );
});

describe("assertCopyable", () => {
  it("returns true for a regular file", () => {
    const source = makeSourceRepo();
    const file = path.join(source, "kept.txt");
    writeFileSync(file, "hello\n");

    expect(assertCopyable(file, "kept.txt")).toBe(true);
  });

  it("returns false for a path that no longer exists", () => {
    const source = makeSourceRepo();

    expect(assertCopyable(path.join(source, "missing.txt"), "missing.txt")).toBe(false);
  });
});

describe("run", () => {
  it("does not throw when the command exits 0", () => {
    const cwd = makeDestination();

    expect(() => run(process.execPath, ["-e", "process.exit(0)"], cwd)).not.toThrow();
  });

  it("throws ERR_BOOTSTRAP_E2E naming the command and exit code when it fails", () => {
    const cwd = makeDestination();

    expect(() => run(process.execPath, ["-e", "process.exit(3)"], cwd)).toThrow(
      /ERR_BOOTSTRAP_E2E:.*exit 3/,
    );
  });
});

const CLAUDE_MD = [
  "# Guide",
  "",
  "## Product",
  "",
  ...PRODUCT_PLACEHOLDER.map((line, index, all) =>
    index < all.length - 1 ? `${line}  ` : line,
  ),
  "",
  "## Commands",
  "",
].join("\n");

describe("assertGenerated", () => {
  const TITLE = "Acme & Co";

  /**
   * A minimal fixture tree that satisfies every check `assertGenerated`
   * makes: the four marker targets (with no residual marker text), a
   * changelog with no version heading, a manifest naming `packageName`
   * at version 0.0.0 with no bin and sideEffects: false, and the workspace
   * files that carry the slug and the title. `manifestOverrides` is merged
   * onto that base manifest so a test can deviate a single field without
   * duplicating the whole shape.
   */
  function writeValidFixture(
    destination: string,
    packageName: string,
    manifestOverrides: Record<string, unknown> = {},
  ): void {
    const workspaceFiles: Record<string, string> = {
      "packages/core/package.json": `{ "name": "@acme-game/core" }\n`,
      "apps/web/package.json": `{ "name": "@acme-game/web" }\n`,
      "apps/web/src/game-info.ts":
        'export const GAME_SLUG = "acme-game";\nexport const GAME_TITLE = "Acme & Co";\n',
      "apps/web/index.html": "<title>Acme &amp; Co</title>\n",
      "pnpm-lock.yaml": "  apps/web:\n    dependencies:\n      '@acme-game/core':\n",
    };
    for (const [relative, contents] of Object.entries(workspaceFiles)) {
      const target = path.join(destination, relative);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, contents);
    }
    for (const relative of [
      "CLAUDE.md",
      "README.md",
      "CONTRIBUTING.md",
      ".github/workflows/ci.yml",
    ]) {
      const target = path.join(destination, relative);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, `# ${relative}\n`);
    }
    writeFileSync(path.join(destination, "CLAUDE.md"), CLAUDE_MD);
    writeFileSync(
      path.join(destination, ORIGIN_FILE),
      `# origin\ntemplate: ${TEMPLATE_URL}\ncommit: unknown\ntree: unknown\n`,
    );
    writeFileSync(
      path.join(destination, "CHANGELOG.md"),
      "# Changelog\n\nAll notable changes are documented here.\n\n## [Unreleased]\n",
    );
    writeFileSync(
      path.join(destination, "package.json"),
      `${JSON.stringify(
        {
          name: packageName,
          version: "0.0.0",
          sideEffects: false,
          ...manifestOverrides,
        },
        null,
        2,
      )}\n`,
    );
  }

  it("passes for a well-formed generated repository", () => {
    const destination = makeDestination();
    writeValidFixture(destination, "acme-game");

    expect(() => assertGenerated(destination, "acme-game", TITLE)).not.toThrow();
  });

  it("throws ERR_PLACEHOLDER_REMAINING when a placeholder target still holds a placeholder", () => {
    const destination = makeDestination();
    writeValidFixture(destination, "acme-game");
    // README.md is both a marker target and a placeholder target; "my-game"
    // mirrors bootstrap.mjs's own TEMPLATE_PACKAGE constant.
    writeFileSync(path.join(destination, "README.md"), "# my-game\n");

    expect(() => assertGenerated(destination, "acme-game", TITLE)).toThrow(
      /ERR_PLACEHOLDER_REMAINING/,
    );
  });

  it("throws ERR_BOOTSTRAP_MARKER when a marker target retains a bootstrap marker", () => {
    const destination = makeDestination();
    writeValidFixture(destination, "acme-game");
    writeFileSync(
      path.join(destination, ".github", "workflows", "ci.yml"),
      "# template-only block\n",
    );

    expect(() => assertGenerated(destination, "acme-game", TITLE)).toThrow(
      /ERR_BOOTSTRAP_MARKER/,
    );
  });

  it("throws ERR_RELEASE_INTENT_PATH_REMAINING when the legacy .changeset directory remains", () => {
    const destination = makeDestination();
    writeValidFixture(destination, "acme-game");
    mkdirSync(path.join(destination, ".changeset"), { recursive: true });

    expect(() => assertGenerated(destination, "acme-game", TITLE)).toThrow(
      /ERR_RELEASE_INTENT_PATH_REMAINING/,
    );
  });

  it("throws ERR_BOOTSTRAP_SCRIPT_REMAINING when scripts/bootstrap.mjs remains", () => {
    const destination = makeDestination();
    writeValidFixture(destination, "acme-game");
    mkdirSync(path.join(destination, "scripts"), { recursive: true });
    writeFileSync(path.join(destination, "scripts", "bootstrap.mjs"), "export {};\n");

    expect(() => assertGenerated(destination, "acme-game", TITLE)).toThrow(
      /ERR_BOOTSTRAP_SCRIPT_REMAINING/,
    );
  });

  it("throws ERR_BOOTSTRAP_RULE_REMAINING when .claude/rules/bootstrap.md remains", () => {
    const destination = makeDestination();
    writeValidFixture(destination, "acme-game");
    mkdirSync(path.join(destination, ".claude", "rules"), { recursive: true });
    writeFileSync(
      path.join(destination, ".claude", "rules", "bootstrap.md"),
      "# Bootstrap\n",
    );

    expect(() => assertGenerated(destination, "acme-game", TITLE)).toThrow(
      /ERR_BOOTSTRAP_RULE_REMAINING/,
    );
  });

  it("throws ERR_CHANGELOG_ENTRY_REMAINING when the changelog retains a version heading", () => {
    const destination = makeDestination();
    writeValidFixture(destination, "acme-game");
    writeFileSync(
      path.join(destination, "CHANGELOG.md"),
      "# Changelog\n\n## 1.0.0 - 2024-01-01\n",
    );

    expect(() => assertGenerated(destination, "acme-game", TITLE)).toThrow(
      /ERR_CHANGELOG_ENTRY_REMAINING/,
    );
  });

  it("throws ERR_CHANGELOG_ENTRY_REMAINING when an entry follows ## [Unreleased]", () => {
    const destination = makeDestination();
    writeValidFixture(destination, "acme-game");
    writeFileSync(
      path.join(destination, "CHANGELOG.md"),
      "# Changelog\n\n## [Unreleased]\n\n- something\n",
    );

    expect(() => assertGenerated(destination, "acme-game", TITLE)).toThrow(
      /ERR_CHANGELOG_ENTRY_REMAINING/,
    );
  });

  it("throws ERR_CHANGELOG_ENTRY_REMAINING when an entry precedes ## [Unreleased]", () => {
    const destination = makeDestination();
    writeValidFixture(destination, "acme-game");
    writeFileSync(
      path.join(destination, "CHANGELOG.md"),
      "# Changelog\n\n- something\n\n## [Unreleased]\n",
    );

    expect(() => assertGenerated(destination, "acme-game", TITLE)).toThrow(
      /ERR_CHANGELOG_ENTRY_REMAINING/,
    );
  });

  it("throws ERR_CHANGELOG_ENTRY_REMAINING when ## [Unreleased] is missing", () => {
    const destination = makeDestination();
    writeValidFixture(destination, "acme-game");
    writeFileSync(path.join(destination, "CHANGELOG.md"), "# Changelog\n");

    expect(() => assertGenerated(destination, "acme-game", TITLE)).toThrow(
      /ERR_CHANGELOG_ENTRY_REMAINING/,
    );
  });

  it("throws ERR_MANIFEST_SHAPE when package.json does not parse to an object", () => {
    const destination = makeDestination();
    writeValidFixture(destination, "acme-game");
    writeFileSync(path.join(destination, "package.json"), "null\n");

    expect(() => assertGenerated(destination, "acme-game", TITLE)).toThrow(
      /ERR_MANIFEST_SHAPE/,
    );
  });

  it("throws ERR_PACKAGE_NAME when package.json#name does not match", () => {
    const destination = makeDestination();
    writeValidFixture(destination, "some-other-name");

    expect(() => assertGenerated(destination, "acme-game", TITLE)).toThrow(
      /ERR_PACKAGE_NAME/,
    );
  });

  it("throws ERR_VERSION_REMAINING when package.json#version is not 0.0.0", () => {
    const destination = makeDestination();
    writeValidFixture(destination, "acme-game", { version: "1.0.0" });

    expect(() => assertGenerated(destination, "acme-game", TITLE)).toThrow(
      /ERR_VERSION_REMAINING/,
    );
  });

  it("throws ERR_BIN_REMAINING when package.json still declares bin", () => {
    const destination = makeDestination();
    writeValidFixture(destination, "acme-game", { bin: "./dist/cli.js" });

    expect(() => assertGenerated(destination, "acme-game", TITLE)).toThrow(
      /ERR_BIN_REMAINING/,
    );
  });

  it.each(["packages/core/package.json", "apps/web/package.json"])(
    "throws ERR_WORKSPACE_NAME when %s keeps the template scope",
    (relative) => {
      const destination = makeDestination();
      writeValidFixture(destination, "acme-game");
      writeFileSync(path.join(destination, relative), `{ "name": "@other/core" }\n`);

      expect(() => assertGenerated(destination, "acme-game", TITLE)).toThrow(
        /ERR_WORKSPACE_NAME/,
      );
    },
  );

  it.each([
    ["apps/web/src/game-info.ts", 'export const GAME_SLUG = "acme-game";\n'],
    [
      "apps/web/src/game-info.ts",
      'export const GAME_SLUG = "other";\nexport const GAME_TITLE = "Acme & Co";\n',
    ],
    ["apps/web/index.html", "<title>Acme & Co</title>\n"],
    ["pnpm-lock.yaml", "  apps/web:\n    dependencies:\n      '@other/core':\n"],
  ])(
    "throws ERR_GAME_RENAME_MISSING when %s does not carry the new name",
    (relative, contents) => {
      const destination = makeDestination();
      writeValidFixture(destination, "acme-game");
      writeFileSync(path.join(destination, relative), contents);

      expect(() => assertGenerated(destination, "acme-game", TITLE)).toThrow(
        /ERR_GAME_RENAME_MISSING/,
      );
    },
  );

  it.each([
    ["scripts/extra.mjs", "// my-game\n"],
    ["apps/web/src/extra.ts", 'export const title = "My Game";\n'],
  ])("throws ERR_TEMPLATE_NAME_REMAINING naming %s", (relative, contents) => {
    const destination = makeDestination();
    writeValidFixture(destination, "acme-game");
    mkdirSync(path.dirname(path.join(destination, relative)), { recursive: true });
    writeFileSync(path.join(destination, relative), contents);

    expect(() => assertGenerated(destination, "acme-game", TITLE)).toThrow(
      new RegExp(`ERR_TEMPLATE_NAME_REMAINING[\\s\\S]*${relative}:1`),
    );
  });

  it.each([
    "CHANGELOG.md",
    "docs/product/requirements.md",
    "docs/design/skill-drafts/x.md",
    "node_modules/pkg/index.js",
    "dist/assets/index.js",
  ])("ignores the template name in %s", (relative) => {
    const destination = makeDestination();
    writeValidFixture(destination, "acme-game");
    const target = path.join(destination, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    const previous = existsSync(target) ? readFileSync(target, "utf8") : "";
    writeFileSync(target, `<!-- my-game, My Game -->\n${previous}`);

    expect(() => assertGenerated(destination, "acme-game", TITLE)).not.toThrow();
  });

  it("scans a nested dist directory for the template name", () => {
    const destination = makeDestination();
    writeValidFixture(destination, "acme-game");
    const relative = "apps/web/src/dist/extra.ts";
    mkdirSync(path.dirname(path.join(destination, relative)), { recursive: true });
    writeFileSync(path.join(destination, relative), "// my-game\n");

    expect(() => assertGenerated(destination, "acme-game", TITLE)).toThrow(
      new RegExp(`ERR_TEMPLATE_NAME_REMAINING[\\s\\S]*${relative}:1`),
    );
  });

  it.each([
    ["absent", undefined],
    ["naming another template", "template: https://example.com/other\n"],
  ])(
    "throws ERR_TEMPLATE_ORIGIN_MISSING when the origin record is %s",
    (_label, text) => {
      const destination = makeDestination();
      writeValidFixture(destination, "acme-game");
      const origin = path.join(destination, ORIGIN_FILE);
      if (text === undefined) {
        rmSync(origin);
      } else {
        writeFileSync(origin, text);
      }

      expect(() => assertGenerated(destination, "acme-game", TITLE)).toThrow(
        /ERR_TEMPLATE_ORIGIN_MISSING/,
      );
    },
  );

  it.each([
    ["written", CLAUDE_MD.replace(/TODO: What this game is[^\n]*/, "A puzzle.")],
    ["missing its heading", CLAUDE_MD.replace("## Product", "## Overview")],
  ])("throws ERR_PRODUCT_PLACEHOLDER_CHANGED when ## Product is %s", (_label, text) => {
    const destination = makeDestination();
    writeValidFixture(destination, "acme-game");
    writeFileSync(path.join(destination, "CLAUDE.md"), text);

    expect(() => assertGenerated(destination, "acme-game", TITLE)).toThrow(
      /ERR_PRODUCT_PLACEHOLDER_CHANGED/,
    );
  });

  it("throws ERR_SIDE_EFFECTS_REMAINING when package.json#sideEffects is not false", () => {
    const destination = makeDestination();
    writeValidFixture(destination, "acme-game", { sideEffects: undefined });

    expect(() => assertGenerated(destination, "acme-game", TITLE)).toThrow(
      /ERR_SIDE_EFFECTS_REMAINING/,
    );
  });
});

const PRODUCT_RED_OUTPUT =
  "AssertionError: expected [ 'CLAUDE.md:12: TODO: What this game is, in one paragraph. — write ## Product from the game's requirements.' ] to deeply equal []";

/** A runner whose `pnpm` behaves like a generated repository's would. */
function fakePnpm(
  checks: { args: string[]; cwd: string; product: string }[],
  {
    productTestFails = true,
    writesZip = true,
    productOutput = PRODUCT_RED_OUTPUT,
  } = {},
): (command: string, args: string[], cwd: string) => void {
  return (command, args, cwd) => {
    if (command !== "pnpm") {
      run(command, args, cwd);
      return;
    }
    const product = readFileSync(path.join(cwd, "CLAUDE.md"), "utf8");
    checks.push({ args, cwd, product });
    if (args[0] === "exec" && productTestFails) {
      throw Object.assign(new Error("ERR_BOOTSTRAP_E2E: simulated red Product test"), {
        output: productOutput,
      });
    }
    if (args[1] === "check" && writesZip) {
      const { name, version } = JSON.parse(
        readFileSync(path.join(cwd, "package.json"), "utf8"),
      ) as { name: string; version: string };
      mkdirSync(path.join(cwd, ".package"), { recursive: true });
      writeFileSync(
        path.join(cwd, ".package", `${name}-${version}-crazygames.zip`),
        "",
      );
    }
  };
}

describe("checkGenerated", () => {
  function generated(version = "0.0.0"): string {
    const destination = makeDestination();
    writeFileSync(path.join(destination, "CLAUDE.md"), CLAUDE_MD);
    writeFileSync(
      path.join(destination, "package.json"),
      JSON.stringify({ name: "space-tiles", version }),
    );
    return destination;
  }

  it.each(["No test files found, exiting with code 1", "Error: failed to load config"])(
    "throws ERR_PRODUCT_SECTION_UNEXPECTED_FAILURE when the Product test fails with %j",
    (productOutput) => {
      const checks: { args: string[]; cwd: string; product: string }[] = [];
      expect(() =>
        checkGenerated(generated(), "space-tiles", fakePnpm(checks, { productOutput })),
      ).toThrow(/ERR_PRODUCT_SECTION_UNEXPECTED_FAILURE/);
      expect(checks.map(({ args }) => args[0])).toEqual(["install", "exec"]);
    },
  );

  it("passes when the Product test fails on its rule and the zip carries package.json#version", () => {
    const checks: { args: string[]; cwd: string; product: string }[] = [];
    const destination = generated("1.2.3");
    expect(() =>
      checkGenerated(destination, "space-tiles", fakePnpm(checks)),
    ).not.toThrow();
    expect(
      existsSync(
        path.join(destination, ".package", "space-tiles-1.2.3-crazygames.zip"),
      ),
    ).toBe(true);
  });

  it("throws ERR_PRODUCT_SECTION_UNCHECKED when the Product test passes unwritten", () => {
    const checks: { args: string[]; cwd: string; product: string }[] = [];
    expect(() =>
      checkGenerated(
        generated(),
        "space-tiles",
        fakePnpm(checks, { productTestFails: false }),
      ),
    ).toThrow(/ERR_PRODUCT_SECTION_UNCHECKED/);
    expect(checks.map(({ args }) => args[0])).toEqual(["install", "exec"]);
  });

  it("throws ERR_PORTAL_ZIP_MISSING when pnpm check writes no zip", () => {
    expect(() =>
      checkGenerated(generated(), "space-tiles", fakePnpm([], { writesZip: false })),
    ).toThrow(/ERR_PORTAL_ZIP_MISSING[\s\S]*space-tiles-0\.0\.0-crazygames\.zip/);
  });

  it("throws ERR_PRODUCT_SECTION_MISSING when CLAUDE.md has no ## Product", () => {
    const destination = makeDestination();
    writeFileSync(path.join(destination, "CLAUDE.md"), "# Guide\n");
    expect(() => writeProductFixture(destination)).toThrow(
      /ERR_PRODUCT_SECTION_MISSING/,
    );
  });

  it("replaces only the Product body with the fixture", () => {
    const destination = generated();
    writeProductFixture(destination);
    const text = readFileSync(path.join(destination, "CLAUDE.md"), "utf8");
    expect(text).not.toContain("TODO:");
    expect(text).toMatch(/^## Product\n\nSpace Tiles is [^\n]+\n\n## Commands\n$/m);
    expect(text.startsWith("# Guide\n\n## Product\n")).toBe(true);
  });
});

describe("main", () => {
  it("installs and checks each generated repository when requested", () => {
    const checks: { args: string[]; cwd: string; product: string }[] = [];
    expect(main(["--check"], fakePnpm(checks))).toBe(0);
    expect(checks.map(({ args }) => args)).toEqual([
      ["install", "--frozen-lockfile"],
      ["exec", "vitest", "run", "tests/product-section.test.ts"],
      ["run", "check"],
    ]);
    expect(checks[1]?.product).toContain("TODO:");
    expect(checks[2]?.product).not.toContain("TODO:");
    expect(new Set(checks.map(({ cwd }) => cwd)).size).toBe(1);
    expect(checks.every(({ cwd }) => !existsSync(cwd))).toBe(true);
  });

  it("retains a failed generated repository for inspection", () => {
    let retained = "";
    expect(() =>
      main(["--check"], (command, args, cwd) => {
        if (command === "pnpm") {
          retained = path.dirname(cwd);
          directories.push(retained);
          throw new Error("simulated generated check failure");
        }
        run(command, args, cwd);
      }),
    ).toThrow("simulated generated check failure");
    expect(
      readFileSync(path.join(retained, "space-tiles", "package.json"), "utf8"),
    ).toContain("space-tiles");
  });

  it.each([{ argv: ["--unknown"] }, { argv: ["--check", "--unknown"] }])(
    "refuses unsupported arguments $argv",
    ({ argv }) => {
      expect(main(argv)).toBe(2);
    },
  );

  it("bootstraps the template into a disposable workspace and validates the result", () => {
    // A real, fast (well under a second) end-to-end run: main() copies this
    // repository's own tracked files, runs the real scripts/bootstrap.mjs
    // subprocess, and validates the result with
    // assertGenerated. This exercises main()'s full orchestration and both
    // run()/assertGenerated() success paths without any mocking.
    expect(main()).toBe(0);
  });
});

describe("PRODUCT_PLACEHOLDER", () => {
  it("matches the template CLAUDE.md's ## Product placeholder lines", () => {
    const lines = readFileSync(
      path.join(import.meta.dirname, "..", "CLAUDE.md"),
      "utf8",
    ).split("\n");
    const start = lines.indexOf("## Product");
    expect(start).toBeGreaterThan(-1);
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((line) => /^#{1,2}\s/.test(line));
    const body = (end === -1 ? rest : rest.slice(0, end))
      .map((line) => line.trim())
      .filter((line) => line !== "");
    expect(body).toEqual(PRODUCT_PLACEHOLDER);
  });
});

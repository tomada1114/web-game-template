#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import console from "node:console";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { MARKER_TARGETS, escapeHtml, findPlaceholders } from "./bootstrap.mjs";
import { isolatedGitEnv } from "./lib/git-env.mjs";
import { isMain } from "./lib/is-main.mjs";
import { parseJson, readKey } from "./lib/json.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LEGACY_RELEASE_DIRECTORY = ".change" + "set";

/**
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 *
 * @remarks
 * Exported so `tests/verify-bootstrap.test.ts` can exercise both outcomes
 * directly with a cheap real subprocess (a bare `node -e`), instead of only
 * through `main()`'s full bootstrap run.
 */
export function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "inherit",
    timeout: 900_000,
    // Every command here runs against a throwaway workspace, so none of them
    // may inherit a hook's GIT_DIR — see scripts/lib/git-env.mjs.
    env: isolatedGitEnv(),
  });
  if (result.status !== 0) {
    throw new Error(
      `ERR_BOOTSTRAP_E2E: ${command} ${args.join(" ")} failed with exit ${String(result.status)}.`,
    );
  }
}

/**
 * Check the lightweight, observable output of one bootstrap run.
 *
 * @param {string} destination
 * @param {string} packageName - The slug bootstrap was given.
 * @param {string} title - The display title bootstrap was given.
 *
 * @remarks
 * Exported so `tests/verify-bootstrap.test.ts` can exercise each of its
 * failure branches directly against a hand-built fixture tree, rather than
 * only through a full, real `main()` bootstrap run.
 */
export function assertGenerated(destination, packageName, title) {
  const placeholders = findPlaceholders(destination);
  if (placeholders.length > 0) {
    throw new Error(
      `ERR_PLACEHOLDER_REMAINING: generated ${packageName} still contains placeholders.\n` +
        placeholders.join("\n"),
    );
  }

  for (const relative of MARKER_TARGETS) {
    const file = path.join(destination, relative);
    if (
      /(?:template-only|profile:[a-z0-9-]+:)/.exec(readFileSync(file, "utf8")) !== null
    ) {
      throw new Error(
        `ERR_BOOTSTRAP_MARKER: generated ${packageName} retains a bootstrap marker in ${relative}.`,
      );
    }
  }

  if (existsSync(path.join(destination, ".claude", "rules", "bootstrap.md"))) {
    throw new Error(
      `ERR_BOOTSTRAP_RULE_REMAINING: generated ${packageName} retains .claude/rules/bootstrap.md.\n` +
        "Expected: bootstrap removes the rule that documents it from the generated repository.\n" +
        "Next: add .claude/rules/bootstrap.md to SELF_REMOVED_PATHS in scripts/bootstrap.mjs, then rerun bootstrap:e2e.",
    );
  }

  if (existsSync(path.join(destination, LEGACY_RELEASE_DIRECTORY))) {
    throw new Error(
      `ERR_RELEASE_INTENT_PATH_REMAINING: generated ${packageName} retains the legacy release directory.`,
    );
  }

  if (existsSync(path.join(destination, "scripts", "bootstrap.mjs"))) {
    throw new Error(
      `ERR_BOOTSTRAP_SCRIPT_REMAINING: generated ${packageName} retains scripts/bootstrap.mjs.\n` +
        "Expected: bootstrap removes its own script from the generated repository.\n" +
        "Next: add scripts/bootstrap.mjs to transform()'s removal list, then rerun bootstrap:e2e.",
    );
  }

  const changelog = readFileSync(path.join(destination, "CHANGELOG.md"), "utf8");
  if (/^## /m.test(changelog)) {
    throw new Error(
      `ERR_CHANGELOG_ENTRY_REMAINING: generated ${packageName} retains a template changelog entry.\n` +
        "Expected: a bare Keep a Changelog skeleton with no version headings.\n" +
        "Next: update the generated CHANGELOG.md skeleton, then rerun bootstrap:e2e.",
    );
  }

  const manifest = parseJson(
    readFileSync(path.join(destination, "package.json"), "utf8"),
  );
  if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
    throw new Error(
      `ERR_MANIFEST_SHAPE: generated ${packageName} has no object manifest.`,
    );
  }
  if (readKey(manifest, "name") !== packageName) {
    throw new Error(`ERR_PACKAGE_NAME: generated package name is not ${packageName}.`);
  }
  if (readKey(manifest, "version") !== "0.0.0") {
    throw new Error(
      `ERR_VERSION_REMAINING: generated ${packageName} does not start at version 0.0.0.\n` +
        `Expected: package.json#version === "0.0.0".\n` +
        `Actual: ${JSON.stringify(readKey(manifest, "version"))}\n` +
        "Next: set GENERATED_VERSION and apply it to package.json#version in " +
        "transform(), then rerun bootstrap:e2e.",
    );
  }
  if (readKey(manifest, "bin") !== undefined) {
    throw new Error(
      "ERR_BIN_REMAINING: generated package still declares package.json#bin.\n" +
        "Expected: no bin entry; bootstrap removes the sample command entry.\n" +
        "Next: remove bin metadata from the template, then rerun bootstrap:e2e.",
    );
  }
  if (readKey(manifest, "sideEffects") !== false) {
    throw new Error(
      "ERR_SIDE_EFFECTS_REMAINING: generated package does not declare sideEffects as false.\n" +
        "Expected: sideEffects: false.\n" +
        "Next: update the template manifest, then rerun bootstrap:e2e.",
    );
  }

  assertRenamedWorkspace(destination, packageName, title);
}

/**
 * Check that the slug and title reached every workspace file that carries
 * them. A missed rename is not a leftover placeholder in every case — a file
 * dropped from bootstrap's target list keeps the template's value and still
 * parses — so each value is checked where it has to land.
 *
 * @param {string} destination
 * @param {string} packageName
 * @param {string} title
 */
function assertRenamedWorkspace(destination, packageName, title) {
  /** @type {[string, string][]} */
  const expectedNames = [
    ["packages/core/package.json", `@${packageName}/core`],
    ["apps/web/package.json", `@${packageName}/web`],
  ];
  for (const [relative, expected] of expectedNames) {
    const workspaceManifest = parseJson(
      readFileSync(path.join(destination, relative), "utf8"),
    );
    if (readKey(workspaceManifest, "name") !== expected) {
      throw new Error(
        `ERR_WORKSPACE_NAME: generated ${relative} is not named ${expected}.\n` +
          `Actual: ${JSON.stringify(readKey(workspaceManifest, "name"))}\n` +
          "Next: list the file in bootstrap.mjs's PLACEHOLDER_TARGETS, then rerun bootstrap:e2e.",
      );
    }
  }

  /** @type {[string, string][]} */
  const expectedText = [
    ["apps/web/src/game-info.ts", `export const GAME_SLUG = "${packageName}";`],
    ["apps/web/src/game-info.ts", `export const GAME_TITLE = "${title}";`],
    ["apps/web/index.html", `<title>${escapeHtml(title)}</title>`],
    // The workspace dependency is the one place the lockfile names a
    // workspace package; a stale key fails `pnpm install --frozen-lockfile`.
    ["pnpm-lock.yaml", `'@${packageName}/core':`],
  ];
  for (const [relative, expected] of expectedText) {
    if (!readFileSync(path.join(destination, relative), "utf8").includes(expected)) {
      throw new Error(
        `ERR_GAME_RENAME_MISSING: generated ${relative} does not carry the new name.\n` +
          `Expected: ${expected}\n` +
          "Next: list the file in bootstrap.mjs's PLACEHOLDER_TARGETS, then rerun bootstrap:e2e.",
      );
    }
  }
}

/**
 * Decide whether a path `git ls-files` reported is safe to copy.
 *
 * `git`'s own untracked-file walk already keeps a genuine socket or FIFO out
 * of the list this guards (`git add`/`ls-files --others` silently drop them),
 * so in practice only a stale index entry or a tracked symlink reach here —
 * but the check is written against "not a regular file" rather than
 * "is a symlink" so it also holds if that git behavior ever changes, or a
 * caller feeds it a path some other way.
 *
 * @param {string} source - Absolute path on disk.
 * @param {string} relative - Repository-relative path, used in the error.
 * @returns {boolean} `true` when `source` is a regular file to copy, `false`
 * when it is a stale index entry to skip.
 */
export function assertCopyable(source, relative) {
  /** @type {import("node:fs").Stats} */
  let stats;
  try {
    stats = lstatSync(source);
  } catch (error) {
    // `git ls-files` lists a path that a later `rm` removed but no commit
    // recorded yet; that is a stale entry, not a file to copy.
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
  if (stats.isFile()) {
    return true;
  }
  throw new Error(
    `ERR_BOOTSTRAP_UNSUPPORTED_ENTRY: ${relative} is not a regular file.\n` +
      "Expected: a regular file, so the copy faithfully reproduces the source tree.\n" +
      `Actual: ${stats.isSymbolicLink() ? "a symlink" : "a socket, FIFO, or device entry"}.\n` +
      "Next: replace it with a real file, or remove it from git, then rerun bootstrap:e2e.",
  );
}

/**
 * Copy every file `git ls-files` reports from `root` into `destination`,
 * preserving relative paths.
 *
 * @param {string} destination
 * @param {string} [root] - Repository root to copy from. Defaults to this
 * template's own checkout.
 */
export function copyTemplate(destination, root = ROOT) {
  const files = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8", timeout: 30_000, env: isolatedGitEnv() },
  );
  if (files.status !== 0) {
    throw new Error(`ERR_GIT_FILES: ${files.stderr.trim()}`);
  }
  for (const relative of files.stdout.split("\0").filter(Boolean)) {
    const source = path.join(root, relative);
    if (!assertCopyable(source, relative)) {
      continue;
    }
    const target = path.join(destination, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(source, target);
  }
}

/**
 * @param {readonly string[]} [argv]
 * @param {typeof run} [runner] - Subprocess boundary, injectable for tests.
 * @returns {number}
 */
export function main(argv = [], runner = run) {
  if (argv.length > 1 || (argv.length === 1 && argv[0] !== "--check")) {
    console.error(
      "ERR_BOOTSTRAP_E2E_ARGUMENT: expected no arguments or --check.\nNext: run pnpm bootstrap:e2e or pnpm bootstrap:check.",
    );
    return 2;
  }
  const workspace = mkdtempSync(path.join(tmpdir(), "typescript-template-e2e-"));
  let passed = false;
  try {
    const packageName = "acme-game";
    const title = "Acme Game";
    const destination = path.join(workspace, packageName);
    mkdirSync(destination);
    copyTemplate(destination);
    runner(
      process.execPath,
      [
        "scripts/bootstrap.mjs",
        packageName,
        "--title",
        title,
        "--author",
        "Ada Lovelace",
        "--github-user",
        "ada",
        "--license",
        "MIT",
      ],
      destination,
    );
    assertGenerated(destination, packageName, title);
    if (argv[0] === "--check") {
      runner("pnpm", ["install", "--frozen-lockfile"], destination);
      runner("pnpm", ["run", "check"], destination);
    }
    console.log(`bootstrap-e2e: ${packageName} passed`);
    passed = true;
    return 0;
  } finally {
    if (passed) {
      rmSync(workspace, { recursive: true, force: true });
    } else {
      console.error(
        `bootstrap-e2e: retained failed generated repositories at ${workspace}`,
      );
    }
  }
}

if (isMain(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}

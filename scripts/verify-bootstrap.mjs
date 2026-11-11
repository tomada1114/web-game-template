#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import console from "node:console";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  MARKER_TARGETS,
  ORIGIN_FILE,
  TEMPLATE_URL,
  escapeHtml,
  findPlaceholders,
} from "./bootstrap.mjs";
import { isolatedGitEnv } from "./lib/git-env.mjs";
import { isMain } from "./lib/is-main.mjs";
import { parseJson, readKey } from "./lib/json.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LEGACY_RELEASE_DIRECTORY = ".change" + "set";

// The template's own name and title. Planning records and the changelog may
// still name them; every other generated file must carry the new ones.
const TEMPLATE_NAMES = ["my-game", "My Game"];
const RESIDUE_EXEMPT_FILES = new Set(["CHANGELOG.md"]);
const RESIDUE_EXEMPT_PREFIXES = ["docs/product/", "docs/design/"];
const RESIDUE_SKIP_DIRECTORIES = new Set([".git", "node_modules", ".package", "dist"]);

// The template's `## Product` placeholder, which the bootstrap must leave as
// it is: a generated repository's first task is to replace it.
const PRODUCT_HEADING = "## Product";
export const PRODUCT_PLACEHOLDER = [
  "TODO: What this game is, in one paragraph.",
  "TODO: Who it is for, and the core interaction.",
  "TODO: Non-goals, copied verbatim from docs/product/requirements.md.",
  "TODO: Where decisions live: docs/product/requirements.md and the skills.",
];
// One line under Prettier's width, so `prettier --check` accepts it unwrapped.
const PRODUCT_FIXTURE = [
  "Space Tiles is the fixture game bootstrap:check writes to turn the gate green.",
];

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
  // The skeleton keeps exactly one empty `## [Unreleased]` heading; any other
  // `## ` heading, or an entry line anywhere in the file, came from the
  // template's history.
  const headings = changelog.match(/^## .*$/gm) ?? [];
  const afterUnreleased = changelog.split(/^## \[Unreleased\]$/m)[1] ?? "";
  const hasEntry = /^\s*[-*+]\s/m.test(changelog);
  if (
    headings.length !== 1 ||
    headings[0] !== "## [Unreleased]" ||
    afterUnreleased.trim() !== "" ||
    hasEntry
  ) {
    throw new Error(
      `ERR_CHANGELOG_ENTRY_REMAINING: generated ${packageName} retains a template changelog entry.\n` +
        "Expected: a Keep a Changelog skeleton whose only heading is an empty ## [Unreleased].\n" +
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
  assertNoTemplateNames(destination, packageName);
  assertOrigin(destination, packageName);
  assertProductPlaceholder(destination, packageName);
}

/**
 * List every regular file under `root` as a forward-slash relative path,
 * skipping dependency, VCS and build directories.
 *
 * @param {string} root
 * @param {string} [relative]
 * @returns {string[]}
 */
function listGeneratedFiles(root, relative = "") {
  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const child = relative === "" ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!RESIDUE_SKIP_DIRECTORIES.has(entry.name)) {
        files.push(...listGeneratedFiles(root, child));
      }
    } else if (entry.isFile()) {
      files.push(child);
    }
  }
  return files;
}

/**
 * @param {string} destination
 * @param {string} packageName
 */
function assertNoTemplateNames(destination, packageName) {
  /** @type {string[]} */
  const found = [];
  for (const relative of listGeneratedFiles(destination)) {
    if (
      RESIDUE_EXEMPT_FILES.has(relative) ||
      RESIDUE_EXEMPT_PREFIXES.some((prefix) => relative.startsWith(prefix))
    ) {
      continue;
    }
    const buffer = readFileSync(path.join(destination, relative));
    if (buffer.includes(0)) {
      continue;
    }
    buffer
      .toString("utf8")
      .split("\n")
      .forEach((line, index) => {
        for (const name of TEMPLATE_NAMES) {
          if (line.includes(name)) {
            found.push(`${relative}:${String(index + 1)}: ${name}`);
          }
        }
      });
  }
  if (found.length > 0) {
    throw new Error(
      `ERR_TEMPLATE_NAME_REMAINING: generated ${packageName} still names the template.\n` +
        found.join("\n") +
        "\nNext: list each file in bootstrap.mjs's PLACEHOLDER_TARGETS, then rerun bootstrap:e2e.",
    );
  }
}

/**
 * @param {string} destination
 * @param {string} packageName
 */
function assertOrigin(destination, packageName) {
  const file = path.join(destination, ORIGIN_FILE);
  const lines = existsSync(file) ? readFileSync(file, "utf8").split("\n") : [];
  if (!lines.includes(`template: ${TEMPLATE_URL}`)) {
    throw new Error(
      `ERR_TEMPLATE_ORIGIN_MISSING: generated ${packageName} has no ${ORIGIN_FILE} naming ${TEMPLATE_URL}.\n` +
        "Next: write it from transform() in scripts/bootstrap.mjs, then rerun bootstrap:e2e.",
    );
  }
}

/**
 * Return the lines between CLAUDE.md's `## Product` heading and the next
 * heading, or `undefined` when there is no such heading.
 *
 * @param {string} text
 * @returns {{ start: number, end: number, lines: string[] } | undefined}
 */
function productSection(text) {
  const lines = text.split("\n");
  const start = lines.indexOf(PRODUCT_HEADING);
  if (start === -1) {
    return undefined;
  }
  let end = start + 1;
  while (end < lines.length && !/^#{1,2}\s/.test(lines[end] ?? "")) {
    end++;
  }
  return { start, end, lines };
}

/**
 * @param {string} destination
 * @param {string} packageName
 */
function assertProductPlaceholder(destination, packageName) {
  const section = productSection(
    readFileSync(path.join(destination, "CLAUDE.md"), "utf8"),
  );
  const body = section?.lines
    .slice(section.start + 1, section.end)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (JSON.stringify(body) !== JSON.stringify(PRODUCT_PLACEHOLDER)) {
    throw new Error(
      `ERR_PRODUCT_PLACEHOLDER_CHANGED: generated ${packageName}'s CLAUDE.md ${PRODUCT_HEADING} is not the template's placeholder.\n` +
        `Expected: ${PRODUCT_PLACEHOLDER.join(" / ")}\n` +
        `Actual: ${body === undefined ? "no heading" : body.join(" / ")}\n` +
        "Next: restore the placeholder in the template's CLAUDE.md, or stop bootstrap rewriting it.",
    );
  }
}

/**
 * Replace the generated CLAUDE.md's `## Product` body with a fixture, as a
 * game's kickoff would.
 *
 * @param {string} destination
 */
export function writeProductFixture(destination) {
  const file = path.join(destination, "CLAUDE.md");
  const section = productSection(readFileSync(file, "utf8"));
  if (section === undefined) {
    throw new Error(`ERR_PRODUCT_SECTION_MISSING: ${file} has no ${PRODUCT_HEADING}.`);
  }
  const { start, end, lines } = section;
  writeFileSync(
    file,
    [
      ...lines.slice(0, start + 1),
      "",
      ...PRODUCT_FIXTURE,
      "",
      ...lines.slice(end),
    ].join("\n"),
  );
}

/**
 * Install the generated repository, prove its Product-section test is red,
 * write the section, and require the full gate and the portal zip.
 *
 * @param {string} destination
 * @param {string} packageName
 * @param {typeof run} runner
 */
export function checkGenerated(destination, packageName, runner) {
  runner("pnpm", ["install", "--frozen-lockfile"], destination);
  let productTestFailed = false;
  try {
    runner(
      "pnpm",
      ["exec", "vitest", "run", "tests/product-section.test.ts"],
      destination,
    );
  } catch {
    productTestFailed = true;
  }
  if (!productTestFailed) {
    throw new Error(
      `ERR_PRODUCT_SECTION_UNCHECKED: generated ${packageName} passes tests/product-section.test.ts with its ${PRODUCT_HEADING} unwritten.\n` +
        `Next: make the test fail while ${ORIGIN_FILE} exists and a TODO: line remains.`,
    );
  }
  writeProductFixture(destination);
  runner("pnpm", ["run", "check"], destination);
  const zip = path.join(".package", `${packageName}-0.0.0-crazygames.zip`);
  if (!existsSync(path.join(destination, zip))) {
    throw new Error(
      `ERR_PORTAL_ZIP_MISSING: generated ${packageName}'s pnpm check wrote no ${zip}.\n` +
        "Next: check package:crazygames names the zip from package.json#name and #version.",
    );
  }
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
    const packageName = "space-tiles";
    const title = "Space Tiles";
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
      checkGenerated(destination, packageName, runner);
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

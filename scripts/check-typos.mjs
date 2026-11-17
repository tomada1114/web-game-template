#!/usr/bin/env node
// Run the Typos workflow's spell check locally, but only with the exact typos
// version that workflow pins: another version carries another dictionary, so
// neither its pass nor its findings would be CI's.
import { spawnSync } from "node:child_process";
import console from "node:console";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { isMain } from "./lib/is-main.mjs";
import { repoRoot } from "./lib/node-tools.mjs";

/** The scan's arguments, identical to the crate-ci/typos action's. */
export const TYPOS_ARGS = Object.freeze([".", "--config", "typos.toml"]);

const WORKFLOW = ".github/workflows/typos.yml";
const PIN_PATTERN =
  /^\s*(?:-\s+)?uses: crate-ci\/typos@[0-9a-f]{40} # v(\d+\.\d+\.\d+)$/;

/**
 * @typedef {object} RunOptions
 * @property {string} cwd - Directory typos runs in.
 * @property {boolean} capture - Pipe stdout and stderr instead of inheriting them.
 * @property {NodeJS.ProcessEnv} [env] - Environment; defaults to `process.env`.
 */

/**
 * @typedef {object} RunResult
 * @property {number | null} status - Exit status, or null when none.
 * @property {string} stdout - Captured stdout; "" when not captured.
 * @property {string | undefined} errorCode - The spawn error's `code`, if any.
 */

/**
 * The typos version `.github/workflows/typos.yml` pins.
 *
 * @param {string} workflowText - The workflow's contents.
 * @returns {string | undefined} `X.Y.Z` when exactly one pinned action line exists.
 */
export function pinnedTyposVersion(workflowText) {
  const versions = workflowText
    .split("\n")
    .map((line) => PIN_PATTERN.exec(line.replace(/\r$/, ""))?.[1])
    .filter((version) => version !== undefined);
  return versions.length === 1 ? versions[0] : undefined;
}

/**
 * The version `typos --version` reported.
 *
 * @param {string} output - Its stdout.
 * @returns {string | undefined} `X.Y.Z` when the output is exactly `typos-cli X.Y.Z`.
 */
export function installedTyposVersion(output) {
  return /^typos-cli (\d+\.\d+\.\d+)$/.exec(output.trim())?.[1];
}

/**
 * Spawn the `typos` on PATH, without a shell.
 *
 * @param {readonly string[]} args - Arguments for typos.
 * @param {RunOptions} options - Where and how to run it.
 * @returns {RunResult} The outcome.
 */
export function runTypos(args, { cwd, capture, env = process.env }) {
  const result = spawnSync("typos", args, {
    cwd,
    env,
    encoding: "utf8",
    timeout: 300_000,
    stdio: capture ? "pipe" : "inherit",
  });
  const error = /** @type {NodeJS.ErrnoException | undefined} */ (result.error);
  return {
    status: result.status,
    stdout: capture && typeof result.stdout === "string" ? result.stdout : "",
    errorCode: error?.code,
  };
}

/**
 * @param {string} root - Repository root.
 * @returns {string | undefined} The workflow text, or undefined when unreadable.
 */
function readWorkflow(root) {
  try {
    return readFileSync(path.join(root, WORKFLOW), "utf8");
  } catch {
    return undefined;
  }
}

/** @param {string} pinned */
function installHint(pinned) {
  return (
    `run \`cargo install typos-cli --locked --version ${pinned}\`, or put the v${pinned} binary ` +
    `from https://github.com/crate-ci/typos/releases/tag/v${pinned} on PATH, then rerun ` +
    "`pnpm check:typos`."
  );
}

/** @param {string} actual */
function failed(actual) {
  console.error(
    "ERR_TYPOS_FAILED: typos could not give a spelling verdict.\n" +
      `Actual: ${actual}\n` +
      "Next: read its own message above, or run `typos --version` by hand.",
  );
  return 1;
}

/**
 * Spell-check the repository with the typos version CI pins.
 *
 * @param {readonly string[]} [argv] - Must be empty.
 * @param {string} [root] - Repository root; defaults to this checkout's.
 * @param {(args: readonly string[], options: RunOptions) => RunResult} [run] - Runs typos.
 * @returns {number} Exit code: 0 clean, 1 on any failure, 2 for bad usage.
 */
export function main(argv = [], root = repoRoot, run = runTypos) {
  if (argv.length > 0) {
    console.error(
      "ERR_TYPOS_USAGE: expected no arguments.\n" +
        "Next: run `pnpm check:typos`; it checks the whole repository, as the Typos workflow does.",
    );
    return 2;
  }

  const text = readWorkflow(root);
  const pinned = text === undefined ? undefined : pinnedTyposVersion(text);
  if (pinned === undefined) {
    console.error(
      "ERR_TYPOS_PIN_UNREADABLE: could not read the typos version CI pins.\n" +
        `Expected: exactly one \`uses: crate-ci/typos@<sha> # vX.Y.Z\` line in ${WORKFLOW}.\n` +
        `Actual: ${text === undefined ? "the file is missing" : "no single such line"}\n` +
        "Next: restore that line; the Typos workflow and this script both take the version from it.",
    );
    return 1;
  }

  const version = run(["--version"], { cwd: root, capture: true });
  if (version.errorCode === "ENOENT") {
    console.error(
      "ERR_TYPOS_MISSING: typos is not on PATH.\n" +
        `Expected: typos-cli ${pinned}, the version ${WORKFLOW} pins.\n` +
        `Next: ${installHint(pinned)} Until then the Typos workflow is what checks the spelling.`,
    );
    return 1;
  }
  if (version.errorCode !== undefined) {
    return failed(version.errorCode);
  }
  const installed =
    version.status === 0 ? installedTyposVersion(version.stdout) : undefined;
  if (installed !== pinned) {
    const actual =
      installed === undefined
        ? `unrecognized \`typos --version\` output (exit ${String(version.status)})`
        : `typos-cli ${installed}`;
    console.error(
      "ERR_TYPOS_VERSION_MISMATCH: the typos on PATH is not the version CI pins.\n" +
        `Expected: typos-cli ${pinned} (${WORKFLOW}).\n` +
        `Actual: ${actual}\n` +
        `Next: install ${pinned} as above; another version carries another dictionary, so its result is not CI's.`,
    );
    return 1;
  }

  const scan = run(TYPOS_ARGS, { cwd: root, capture: false });
  if (scan.errorCode !== undefined) {
    return failed(scan.errorCode);
  }
  if (scan.status === 0) {
    console.log(`typos ${pinned}: no misspellings, at the version CI pins.`);
    return 0;
  }
  if (scan.status === 2) {
    console.error(
      `ERR_TYPOS_FOUND: typos ${pinned} reported the misspellings above.\n` +
        "Next: fix the text, or add a word spelled that way on purpose to typos.toml's " +
        "[default.extend-words] with a comment saying why.",
    );
    return 1;
  }
  return failed(`exit ${String(scan.status)}`);
}

if (isMain(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}

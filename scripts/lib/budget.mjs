// The bundle budget: how large a web build may be, and the measurement that
// holds a directory to it.
//
// The limits sit far below the portal's own ceilings on purpose: a budget at
// the ceiling would report the problem only once the build is already
// unshippable. Raising one is a gate change, not a fix for a red run.
import console from "node:console";
import { lstatSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/** Largest total size a build may have, in bytes. The limit itself passes. */
export const BUDGET_MAX_BYTES = 5_242_880;

/** Largest number of files a build may hold. The limit itself passes. */
export const BUDGET_MAX_FILES = 300;

const REPORTED_FILES = 5;

/** The command that remeasures the local web build. */
const BUDGET_RERUN = "pnpm budget";

/** A build directory {@link listFiles} cannot measure. */
export class BudgetError extends Error {
  /**
   * @param {string} file - The symbolic link, relative to the build directory.
   */
  constructor(file) {
    super(`ERR_BUDGET_SYMLINK: ${file} in the build is a symbolic link.`);
    this.name = "BudgetError";
    this.code = "ERR_BUDGET_SYMLINK";
    this.file = file;
  }
}

/**
 * One file of a build.
 *
 * @typedef {object} BuildFile
 * @property {string} path - Path relative to the build directory, with `/`
 * separators on every platform.
 * @property {number} bytes - Size on disk.
 */

/**
 * List every file under a directory, in a stable order.
 *
 * @param {string} directory - Absolute path of an existing directory.
 * @returns {BuildFile[]} The files, sorted by path.
 * @throws BudgetError with code ERR_BUDGET_SYMLINK when the directory holds a
 * symbolic link: its size on disk is the link's, not what a reader of the
 * file gets, and a link to a directory cannot be read as a file at all.
 */
export function listFiles(directory) {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => !entry.isDirectory())
    .map((entry) => {
      const absolute = path.join(entry.parentPath, entry.name);
      const relative = path.relative(directory, absolute).split(path.sep).join("/");
      if (entry.isSymbolicLink()) {
        throw new BudgetError(relative);
      }
      return { path: relative, bytes: lstatSync(absolute).size };
    })
    .sort((a, b) => (a.path < b.path ? -1 : 1));
}

/**
 * Measure a build directory against the budget and report the result.
 *
 * @param {string} given - The directory, relative to `root` or absolute. It
 * is named in the report as given.
 * @param {string} root - Directory a relative `given` resolves against.
 * @param {string} [rerun] - The command that rebuilds and remeasures `given`,
 * named in a failure's Next: line; defaults to `pnpm budget`.
 * @returns {number} Process exit code: 0 within the budget, 1 over it, with
 * nothing to measure, or with a directory that cannot be measured.
 */
export function checkBudget(given, root, rerun = BUDGET_RERUN) {
  const directory = path.resolve(root, given);
  if (statSync(directory, { throwIfNoEntry: false })?.isDirectory() !== true) {
    console.error(
      `ERR_BUDGET_NO_BUILD: ${given} is not a directory.\n` +
        "Expected: the directory a build wrote.\n" +
        // `pnpm budget` measures a build it did not make; any other caller's
        // command builds the directory itself.
        (rerun === BUDGET_RERUN
          ? "Next: run `pnpm build`, then rerun `pnpm budget`."
          : `Next: rerun \`${rerun}\`.`),
    );
    return 1;
  }

  /** @type {BuildFile[]} */
  let files;
  try {
    files = listFiles(directory);
  } catch (error) {
    if (error instanceof BudgetError) {
      console.error(
        `${error.message}\n` +
          `Expected: regular files and directories only in ${given}.\n` +
          `Next: make the build copy ${error.file} instead of linking it, ` +
          `then rerun \`${rerun}\`.`,
      );
      return 1;
    }
    throw error;
  }
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const largest = files
    .toSorted((a, b) => b.bytes - a.bytes)
    .slice(0, REPORTED_FILES)
    .map((file) => `  ${String(file.bytes)} ${file.path}`);
  const report = [`Largest files (bytes, path):`, ...largest].join("\n");

  if (totalBytes > BUDGET_MAX_BYTES || files.length > BUDGET_MAX_FILES) {
    console.error(
      `ERR_BUDGET_EXCEEDED: ${given} is over the bundle budget.\n` +
        `Expected: ≤ ${String(BUDGET_MAX_BYTES)} bytes\n` +
        `Actual: ${String(totalBytes)} bytes\n` +
        `Expected: ≤ ${String(BUDGET_MAX_FILES)} files\n` +
        `Actual: ${String(files.length)} files\n` +
        `${report}\n` +
        `Next: shrink or drop the largest files, then rerun \`${rerun}\`.`,
    );
    return 1;
  }
  console.log(
    `budget: ${given} is within the bundle budget.\n` +
      `Bytes: ${String(totalBytes)} of ${String(BUDGET_MAX_BYTES)}\n` +
      `Files: ${String(files.length)} of ${String(BUDGET_MAX_FILES)}\n` +
      report,
  );
  return 0;
}

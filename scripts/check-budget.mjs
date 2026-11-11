#!/usr/bin/env node
// Fail the gate when a web build outgrows the portal budget.
//
// The limits sit far below the portal's own ceilings on purpose: a budget at
// the ceiling would report the problem only once the build is already
// unshippable. Raising one is a gate change, not a fix for a red run.
import console from "node:console";
import { lstatSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { isMain } from "./lib/is-main.mjs";
import { repoRoot } from "./lib/node-tools.mjs";

/** Largest total size a build may have, in bytes. The limit itself passes. */
export const BUDGET_MAX_BYTES = 5_242_880;

/** Largest number of files a build may hold. The limit itself passes. */
export const BUDGET_MAX_FILES = 300;

const DEFAULT_DIRECTORY = "apps/web/dist";
const REPORTED_FILES = 5;

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
 */
export function listFiles(directory) {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => !entry.isDirectory())
    .map((entry) => {
      const absolute = path.join(entry.parentPath, entry.name);
      return {
        path: path.relative(directory, absolute).split(path.sep).join("/"),
        bytes: lstatSync(absolute).size,
      };
    })
    .sort((a, b) => (a.path < b.path ? -1 : 1));
}

/**
 * Measure a build directory against the budget and report the result.
 *
 * @param {readonly string[]} [argv] - At most one directory, relative to
 * `root` or absolute; defaults to the local web build.
 * @param {string} [root] - Directory a relative argument resolves against;
 * defaults to this repository's root.
 * @returns {number} Process exit code: 0 within the budget, 1 over it or with
 * nothing to measure, 2 for bad usage.
 */
export function main(argv = [], root = repoRoot) {
  if (argv.length > 1) {
    console.error(
      "ERR_BUDGET_USAGE: expected at most one directory.\n" +
        "Next: run `pnpm budget` or `pnpm budget <dir>`.",
    );
    return 2;
  }
  const given = argv[0] ?? DEFAULT_DIRECTORY;
  const directory = path.resolve(root, given);
  if (statSync(directory, { throwIfNoEntry: false })?.isDirectory() !== true) {
    console.error(
      `ERR_BUDGET_NO_BUILD: ${given} is not a directory.\n` +
        "Expected: the directory a build wrote.\n" +
        "Next: run `pnpm build`, then rerun `pnpm budget`.",
    );
    return 1;
  }

  const files = listFiles(directory);
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
        "Next: shrink or drop the largest files, then rerun `pnpm budget`.",
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

if (isMain(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}

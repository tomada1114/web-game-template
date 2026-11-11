#!/usr/bin/env node
// Fail the gate when a web build outgrows the bundle budget. The limits and
// the measurement live in scripts/lib/budget.mjs, which the portal packaging
// also runs on its own build.
import console from "node:console";
import process from "node:process";

import { checkBudget } from "./lib/budget.mjs";
import { isMain } from "./lib/is-main.mjs";
import { repoRoot } from "./lib/node-tools.mjs";

const DEFAULT_DIRECTORY = "apps/web/dist";

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
  return checkBudget(argv[0] ?? DEFAULT_DIRECTORY, root);
}

if (isMain(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}

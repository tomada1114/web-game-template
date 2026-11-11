import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// `pnpm check` is `check:source` plus the steps that need its build: the
// bundle budget and the portal package. `.github/workflows/ci.yml`'s `static`
// and `test` jobs cover the same ground as separate `run:` steps (split for
// failure attribution — a reader should see which step failed, not just that
// the composite did). Nothing else asserts the two lists stay in sync, so a
// step added to `check` or `check:source` alone would be enforced locally but
// never in CI.
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

/** A script name has no exception here today, but the mechanism stays ready. */
const CI_SYNC_EXCEPTIONS = new Map<string, string>();

/** Read one script's definition out of the root `package.json`. */
function packageScript(name: string): string {
  const manifest: unknown = JSON.parse(
    readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  const scripts =
    typeof manifest === "object" && manifest !== null && "scripts" in manifest
      ? manifest.scripts
      : undefined;
  const script =
    typeof scripts === "object" && scripts !== null && name in scripts
      ? (scripts as Record<string, unknown>)[name]
      : undefined;
  if (typeof script !== "string") {
    throw new Error(`package.json has no "${name}" script to check.`);
  }
  return script;
}

/** Extract the `pnpm run <name>` tokens out of a script's definition, in order. */
function scriptSteps(name: string): string[] {
  return [...packageScript(name).matchAll(/pnpm run ([\w:-]+)/g)].map(
    (match) => match[1] ?? "",
  );
}

/**
 * Extract every `pnpm run <name>` step inside one named top-level job block
 * of `ci.yml`, from that job's header up to the next top-level job (or the
 * end of the file).
 */
function ciJobSteps(
  jobName: string,
  text = readFileSync(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8"),
): string[] {
  const jobStart = new RegExp(`^  ${jobName}:$`, "m").exec(text);
  if (jobStart === null) {
    throw new Error(`ci.yml has no top-level job named "${jobName}".`);
  }
  const rest = text.slice(jobStart.index + jobStart[0].length);
  const nextJob = /^ {2}[a-z][a-z0-9-]*:$/m.exec(rest);
  const body = nextJob === null ? rest : rest.slice(0, nextJob.index);
  return [...body.matchAll(/run:\s*pnpm run ([\w:-]+)/g)].map(
    (match) => match[1] ?? "",
  );
}

describe("ciJobSteps", () => {
  it("ends a job's slice at the next job even when that job's name has a digit", () => {
    const text = [
      "jobs:",
      "  test:",
      "    steps:",
      "      - run: pnpm run test:coverage",
      "  e2e:",
      "    steps:",
      "      - run: pnpm run test:e2e",
      "",
    ].join("\n");
    expect(ciJobSteps("test", text)).toEqual(["test:coverage"]);
  });
});

describe("pnpm check stays in sync with ci.yml", () => {
  const sourceSteps = scriptSteps("check:source");
  // Derived from `check` itself, not listed here, so a step added to it later
  // is held to ci.yml without anyone remembering to extend this file.
  const addedSteps = scriptSteps("check").filter((step) => step !== "check:source");
  const steps = [...sourceSteps, ...addedSteps];
  const staticSteps = ciJobSteps("static");
  const ciSteps = new Set([...staticSteps, ...ciJobSteps("test")]);

  it("found at least one step to check", () => {
    expect(steps.length).toBeGreaterThan(0);
  });

  it("check:source is exactly the source gates, with no packaging or docs step", () => {
    expect(sourceSteps).toEqual([
      "format:check",
      "lint",
      "typecheck",
      "test:coverage",
      "build",
    ]);
  });

  it("check is check:source, then the budget, then the portal package", () => {
    expect(packageScript("check")).toBe(
      "pnpm run check:source && pnpm run budget && pnpm run package:crazygames",
    );
    expect(addedSteps).toEqual(["budget", "package:crazygames"]);
  });

  it.each(steps)(
    "%s runs as its own ci.yml step, or is a documented exception",
    (step) => {
      expect(ciSteps.has(step) || CI_SYNC_EXCEPTIONS.has(step)).toBe(true);
    },
  );

  it("runs the steps check adds in the static job, after the build they read", () => {
    // The budget measures apps/web/dist, which exists only in the job that
    // built it, and `check` runs the three in this order.
    expect(
      staticSteps.filter((step) => step === "build" || addedSteps.includes(step)),
    ).toEqual(["build", ...addedSteps]);
  });

  it("every documented exception still names a real check step", () => {
    for (const name of CI_SYNC_EXCEPTIONS.keys()) {
      expect(steps).toContain(name);
    }
  });
});

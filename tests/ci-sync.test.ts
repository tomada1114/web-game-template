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

/** Read the `scripts` table out of the root `package.json`. */
function packageScripts(): Record<string, unknown> {
  const manifest: unknown = JSON.parse(
    readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  const scripts =
    typeof manifest === "object" && manifest !== null && "scripts" in manifest
      ? manifest.scripts
      : undefined;
  return typeof scripts === "object" && scripts !== null
    ? (scripts as Record<string, unknown>)
    : {};
}

/** Read one script's definition out of the root `package.json`. */
function packageScript(name: string): string {
  const script = packageScripts()[name];
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

// Only pnpm's own commands may appear in CLAUDE.md without a script behind
// them: in a fenced block of its Commands section, or in an inline-code span
// anywhere in its prose. Any other name is a command an agent would run and
// watch fail.
const MEMORY_FILE = "CLAUDE.md";
const PNPM_BUILT_INS = new Set(["install", "exec"]);

function pnpmScriptNames(text: string): string[] {
  const names: string[] = [];
  // `[a-z]` first skips `pnpm --flag …`; `run` is pnpm's long form of a script.
  for (const match of text.matchAll(/\bpnpm (?:run )?([a-z][\w:-]*)/g)) {
    const name = match[1] ?? "";
    if (!PNPM_BUILT_INS.has(name)) {
      names.push(name);
    }
  }
  return names;
}

function memoryScripts(memory: string): string[] {
  const fence = /^```[^\n]*\n[\s\S]*?^```/gm;
  const names: string[] = [];
  const start = memory.indexOf("\n## Commands\n");
  if (start !== -1) {
    const rest = memory.slice(start + 1);
    const next = rest.indexOf("\n## ", 1);
    const section = next === -1 ? rest : rest.slice(0, next);
    for (const block of section.matchAll(fence)) {
      names.push(...pnpmScriptNames(block[0]));
    }
  }
  for (const span of memory.replace(fence, "").matchAll(/`([^`\n]+)`/g)) {
    names.push(...pnpmScriptNames(span[1] ?? ""));
  }
  return names;
}

describe(`${MEMORY_FILE} names only package.json scripts`, () => {
  it("defines every script CLAUDE.md names", () => {
    const memory = readFileSync(path.join(repoRoot, MEMORY_FILE), "utf8");
    const scripts = packageScripts();
    const named = memoryScripts(memory);

    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((name) => !(name in scripts))).toEqual([]);
  });

  it("skips pnpm's own install and exec, and flags", () => {
    const memory = [
      "## Commands",
      "",
      "```sh",
      "pnpm install --frozen-lockfile",
      "pnpm exec vitest run",
      "pnpm --filter web build",
      "pnpm budget",
      "```",
      "",
      "## Architecture",
      "",
      "```sh",
      "pnpm outside-the-section",
      "```",
      "",
    ].join("\n");
    expect(memoryScripts(`# Guide\n\n${memory}`)).toEqual(["budget"]);
  });

  it("reads `pnpm run <x>` as script x", () => {
    const memory = ["## Commands", "", "```sh", "pnpm run lint", "```", ""].join("\n");
    expect(memoryScripts(`# Guide\n\n${memory}`)).toEqual(["lint"]);
  });

  it("reads inline-code mentions in the prose", () => {
    const memory = [
      "# Guide",
      "",
      "Run `pnpm typecheck` then `pnpm build && pnpm run budget`; plain pnpm",
      "prose outside code is not a command, nor is `pnpm-workspace.yaml`.",
      "",
    ].join("\n");
    expect(memoryScripts(memory)).toEqual(["typecheck", "build", "budget"]);
  });
});

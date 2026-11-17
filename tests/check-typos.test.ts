import consoleModule from "node:console";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";

import {
  installedTyposVersion,
  main,
  pinnedTyposVersion,
  runTypos,
  TYPOS_ARGS,
} from "../scripts/check-typos.mjs";

// No test here needs a real `typos` binary, and none asserts the real pin's
// number: fixtures use 9.8.7, so a Dependabot bump of the pin never turns a
// test red. The script imports `console` from "node:console", so the spies
// target that module — see tests/clean.test.ts.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHA = "a8168dc2984a9e2352f183ffe788f0f23a300389";
const PIN_LINE = `      - uses: crate-ci/typos@${SHA} # v9.8.7`;

const workspaces: string[] = [];
let stdout: MockInstance<typeof consoleModule.log>;
let stderr: MockInstance<typeof consoleModule.error>;

interface RunResult {
  status: number | null;
  stdout: string;
  errorCode: string | undefined;
}
interface RunCall {
  args: readonly string[];
  options: { cwd: string; capture: boolean };
}

function makeDirectory(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "check-typos-test-"));
  workspaces.push(dir);
  return dir;
}

/** A root holding `.github/workflows/typos.yml` with `text`, or none when undefined. */
function makeRoot(text: string | undefined): string {
  const root = makeDirectory();
  if (text !== undefined) {
    mkdirSync(path.join(root, ".github", "workflows"), { recursive: true });
    writeFileSync(path.join(root, ".github", "workflows", "typos.yml"), text);
  }
  return root;
}

function workflow(...lines: string[]): string {
  return ["jobs:", "  typos:", "    steps:", ...lines, ""].join("\n");
}

/** A fake runner answering `--version` and then the scan from the given results. */
function fakeRun(version: RunResult, scan?: RunResult) {
  const calls: RunCall[] = [];
  const run = (args: readonly string[], options: { cwd: string; capture: boolean }) => {
    calls.push({ args, options });
    if (args[0] === "--version") {
      return version;
    }
    if (scan === undefined) {
      throw new Error("the scan must not run");
    }
    return scan;
  };
  return { calls, run };
}

function ok(output: string): RunResult {
  return { status: 0, stdout: output, errorCode: undefined };
}

function printed(spy: MockInstance): string {
  return spy.mock.calls.map((call) => String(call[0])).join("\n");
}

beforeEach(() => {
  stdout = vi.spyOn(consoleModule, "log").mockImplementation(() => undefined);
  stderr = vi.spyOn(consoleModule, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  while (workspaces.length > 0) {
    const dir = workspaces.pop();
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("pinnedTyposVersion", () => {
  it("reads the version from the action line, with or without a leading dash", () => {
    expect(pinnedTyposVersion(workflow(PIN_LINE))).toBe("9.8.7");
    expect(
      pinnedTyposVersion(workflow(`        uses: crate-ci/typos@${SHA} # v9.8.7`)),
    ).toBe("9.8.7");
  });

  it("returns undefined without exactly one well-formed pin line", () => {
    expect(pinnedTyposVersion(workflow("      - run: echo"))).toBeUndefined();
    expect(pinnedTyposVersion(workflow(PIN_LINE, PIN_LINE))).toBeUndefined();
    expect(
      pinnedTyposVersion(workflow("      - uses: crate-ci/typos@v1 # v9.8.7")),
    ).toBeUndefined();
    expect(
      pinnedTyposVersion(workflow(`      - uses: crate-ci/typos@${SHA}`)),
    ).toBeUndefined();
    expect(
      pinnedTyposVersion(workflow(`      - uses: crate-ci/typos@${SHA} # v9`)),
    ).toBeUndefined();
    expect(
      pinnedTyposVersion(workflow(`      - uses: crate-ci/typos@${SHA} # v9.8`)),
    ).toBeUndefined();
  });

  it("ignores another action's version comment", () => {
    const other = `      - uses: actions/checkout@${SHA} # v7.0.1`;
    expect(pinnedTyposVersion(workflow(other))).toBeUndefined();
    expect(pinnedTyposVersion(workflow(other, PIN_LINE))).toBe("9.8.7");
  });
});

describe("installedTyposVersion", () => {
  it("parses exactly `typos-cli X.Y.Z`", () => {
    expect(installedTyposVersion("typos-cli 9.8.7\n")).toBe("9.8.7");
    expect(installedTyposVersion("typos-cli 9.8.70")).toBe("9.8.70");
    expect(installedTyposVersion("")).toBeUndefined();
    expect(installedTyposVersion("typos 9.8.7")).toBeUndefined();
    expect(installedTyposVersion("typos-cli 9.8")).toBeUndefined();
  });
});

describe("main", () => {
  it("rejects any argument without running typos", () => {
    const { calls, run } = fakeRun(ok("typos-cli 9.8.7"));
    expect(main(["src"], makeRoot(workflow(PIN_LINE)), run)).toBe(2);
    expect(printed(stderr)).toContain("ERR_TYPOS_USAGE");
    expect(calls).toHaveLength(0);
  });

  it("fails when the workflow file is absent", () => {
    const { calls, run } = fakeRun(ok("typos-cli 9.8.7"));
    expect(main([], makeRoot(undefined), run)).toBe(1);
    expect(printed(stderr)).toContain("ERR_TYPOS_PIN_UNREADABLE");
    expect(calls).toHaveLength(0);
  });

  it("fails when the workflow has no readable pin", () => {
    const { calls, run } = fakeRun(ok("typos-cli 9.8.7"));
    expect(main([], makeRoot(workflow("      - run: echo")), run)).toBe(1);
    expect(printed(stderr)).toContain("ERR_TYPOS_PIN_UNREADABLE");
    expect(calls).toHaveLength(0);
  });

  it("reports a missing binary with the pinned version", () => {
    const { calls, run } = fakeRun({ status: null, stdout: "", errorCode: "ENOENT" });
    expect(main([], makeRoot(workflow(PIN_LINE)), run)).toBe(1);
    expect(printed(stderr)).toContain("ERR_TYPOS_MISSING");
    expect(printed(stderr)).toContain("9.8.7");
    expect(calls.map((call) => call.args)).toEqual([["--version"]]);
  });

  it("refuses another version before scanning", () => {
    const { calls, run } = fakeRun(ok("typos-cli 9.8.8\n"));
    expect(main([], makeRoot(workflow(PIN_LINE)), run)).toBe(1);
    expect(printed(stderr)).toContain("ERR_TYPOS_VERSION_MISMATCH");
    expect(printed(stderr)).toContain("9.8.7");
    expect(printed(stderr)).toContain("9.8.8");
    expect(calls).toHaveLength(1);
  });

  it("treats a version that merely starts with the pin as a mismatch", () => {
    const { calls, run } = fakeRun(ok("typos-cli 9.8.70"));
    expect(main([], makeRoot(workflow(PIN_LINE)), run)).toBe(1);
    expect(printed(stderr)).toContain("ERR_TYPOS_VERSION_MISMATCH");
    expect(calls).toHaveLength(1);
  });

  it("treats unparsable or failing `--version` output as a mismatch", () => {
    for (const version of [
      ok("something else"),
      { status: 1, stdout: "typos-cli 9.8.7", errorCode: undefined },
    ]) {
      stderr.mockClear();
      const { calls, run } = fakeRun(version);
      expect(main([], makeRoot(workflow(PIN_LINE)), run)).toBe(1);
      expect(printed(stderr)).toContain("ERR_TYPOS_VERSION_MISMATCH");
      expect(calls).toHaveLength(1);
    }
  });

  it("reports another spawn error as a failure", () => {
    const { calls, run } = fakeRun({ status: null, stdout: "", errorCode: "EACCES" });
    expect(main([], makeRoot(workflow(PIN_LINE)), run)).toBe(1);
    expect(printed(stderr)).toContain("ERR_TYPOS_FAILED");
    expect(calls).toHaveLength(1);
  });

  it("scans with the action's arguments and passes on a clean run", () => {
    const root = makeRoot(workflow(PIN_LINE));
    const { calls, run } = fakeRun(ok("typos-cli 9.8.7\n"), ok(""));
    expect(main([], root, run)).toBe(0);
    expect(calls).toEqual([
      { args: ["--version"], options: { cwd: root, capture: true } },
      { args: [".", "--config", "typos.toml"], options: { cwd: root, capture: false } },
    ]);
    expect(printed(stdout)).toContain("9.8.7");
    expect(stderr).not.toHaveBeenCalled();
  });

  it("reports misspellings when the scan exits 2", () => {
    const { run } = fakeRun(ok("typos-cli 9.8.7"), {
      status: 2,
      stdout: "",
      errorCode: undefined,
    });
    expect(main([], makeRoot(workflow(PIN_LINE)), run)).toBe(1);
    expect(printed(stderr)).toContain("ERR_TYPOS_FOUND");
  });

  it("reports any other scan outcome as a failure, not a finding", () => {
    for (const scan of [
      { status: 78, stdout: "", errorCode: undefined },
      { status: null, stdout: "", errorCode: undefined },
    ]) {
      stderr.mockClear();
      const { run } = fakeRun(ok("typos-cli 9.8.7"), scan);
      expect(main([], makeRoot(workflow(PIN_LINE)), run)).toBe(1);
      expect(printed(stderr)).toContain("ERR_TYPOS_FAILED");
      expect(printed(stderr)).not.toContain("ERR_TYPOS_FOUND");
    }
  });
});

describe("runTypos", () => {
  it("reports ENOENT when no typos is on PATH", () => {
    const result = runTypos(["--version"], {
      cwd: makeDirectory(),
      capture: true,
      env: { PATH: makeDirectory() },
    });
    expect(result.status).toBeNull();
    expect(result.errorCode).toBe("ENOENT");
  });

  it("returns the captured stdout and exit status of the binary on PATH", () => {
    for (const code of [0, 2]) {
      const bin = makeDirectory();
      const stand = path.join(bin, "typos");
      writeFileSync(stand, `#!/bin/sh\necho "typos-cli 9.8.7"\nexit ${String(code)}\n`);
      chmodSync(stand, 0o755);
      const result = runTypos(["--version"], {
        cwd: makeDirectory(),
        capture: true,
        env: { PATH: bin },
      });
      expect(result).toEqual({
        status: code,
        stdout: "typos-cli 9.8.7\n",
        errorCode: undefined,
      });
    }
  });
});

describe("the repository's typos wiring", () => {
  const workflowText = readFileSync(
    path.join(repoRoot, ".github/workflows/typos.yml"),
    "utf8",
  );

  it("pins a readable typos version", () => {
    expect(pinnedTyposVersion(workflowText)).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("gives the action the same config the script passes", () => {
    expect(TYPOS_ARGS).toEqual([".", "--config", "typos.toml"]);
    const lines = workflowText.split("\n");
    const usesIndex = lines.findIndex((line) => line.includes("uses: crate-ci/typos@"));
    expect(usesIndex).toBeGreaterThanOrEqual(0);
    const usesIndent = (lines[usesIndex] ?? "").search(/\S/);
    const withIndex = usesIndex + 1;
    const withLine = lines[withIndex] ?? "";
    expect(withLine.trim()).toBe("with:");
    const withIndent = withLine.search(/\S/);
    expect(withIndent).toBeGreaterThan(usesIndent);
    const keys: string[] = [];
    for (const line of lines.slice(withIndex + 1)) {
      if (line.trim() === "" || line.search(/\S/) <= withIndent) {
        break;
      }
      keys.push(line.trim());
    }
    expect(keys).toEqual([`config: ${String(TYPOS_ARGS[2])}`]);
    expect(existsSync(path.join(repoRoot, String(TYPOS_ARGS[2])))).toBe(true);
  });

  it("is its own script, outside the gate and the hook", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(repoRoot, "package.json"), "utf8"),
    ) as {
      scripts: Record<string, string>;
    };
    expect(manifest.scripts["check:typos"]).toBe("node scripts/check-typos.mjs");
    // release.yml, pnpm bootstrap:check and a fresh clone run the gate with no
    // typos binary, so neither the gate nor the hook may call it.
    for (const name of ["check", "check:quick", "check:source"]) {
      expect(manifest.scripts[name]).not.toMatch(/typos/);
    }
    expect(readFileSync(path.join(repoRoot, "lefthook.yml"), "utf8")).not.toMatch(
      /typos/,
    );
  });
});

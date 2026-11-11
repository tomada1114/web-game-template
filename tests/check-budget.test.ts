import { Buffer } from "node:buffer";
import consoleModule from "node:console";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";

import {
  BUDGET_MAX_BYTES,
  BUDGET_MAX_FILES,
  listFiles,
  main,
} from "../scripts/check-budget.mjs";

// Every tree measured here is built in a fresh temporary directory, never the
// real apps/web/dist: the result must not depend on what this checkout last
// built. scripts/check-budget.mjs imports `console` from "node:console", so
// the spies target that module — see tests/clean.test.ts.

const workspaces: string[] = [];
let stdout: MockInstance<typeof consoleModule.log>;
let stderr: MockInstance<typeof consoleModule.error>;

/** A throwaway directory standing in for a repository root or a build. */
function makeDirectory(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "check-budget-test-"));
  workspaces.push(dir);
  return dir;
}

/** Write a file of exactly `bytes` bytes, creating its parent directories. */
function writeSized(directory: string, relative: string, bytes: number): void {
  const file = path.join(directory, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, Buffer.alloc(bytes, "a"));
}

/** A build of `count` one-byte files. */
function makeBuildOfFiles(count: number): string {
  const directory = makeDirectory();
  for (let index = 0; index < count; index += 1) {
    writeSized(directory, `file-${String(index)}.txt`, 1);
  }
  return directory;
}

/** Everything the script printed to one stream, as a single string. */
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

describe("the budget limits", () => {
  it("are 5 MiB and 300 files", () => {
    expect(BUDGET_MAX_BYTES).toBe(5_242_880);
    expect(BUDGET_MAX_FILES).toBe(300);
  });
});

describe("the byte budget", () => {
  it("passes a build of 3 files totalling 4,999,999 bytes and reports it", () => {
    const build = makeDirectory();
    writeSized(build, "index.html", 999_999);
    writeSized(build, "assets/game.js", 3_000_000);
    writeSized(build, "assets/art.png", 1_000_000);

    expect(main([build])).toBe(0);
    const report = printed(stdout);
    expect(report).toContain("Bytes: 4999999 of 5242880");
    expect(report).toContain("Files: 3 of 300");
    expect(report).toContain("3000000 assets/game.js");
    expect(report).toContain("1000000 assets/art.png");
    expect(report).toContain("999999 index.html");
    expect(stderr).not.toHaveBeenCalled();
  });

  it("passes at exactly 5,242,880 bytes: the limit is inclusive", () => {
    const build = makeDirectory();
    writeSized(build, "index.html", 5_242_880);

    expect(main([build])).toBe(0);
    expect(printed(stdout)).toContain("Bytes: 5242880 of 5242880");
  });

  it("fails at 5,242,881 bytes with expected against actual", () => {
    const build = makeDirectory();
    writeSized(build, "index.html", 5_242_880);
    writeSized(build, "assets/one-byte-too-many.txt", 1);

    expect(main([build])).toBe(1);
    const failure = printed(stderr);
    expect(failure).toContain("ERR_BUDGET_EXCEEDED");
    expect(failure).toContain("Expected: ≤ 5242880 bytes");
    expect(failure).toContain("Actual: 5242881 bytes");
    expect(failure).toContain("5242880 index.html");
    expect(stdout).not.toHaveBeenCalled();
  });
});

describe("the file budget", () => {
  it("passes at exactly 300 files: the limit is inclusive", () => {
    expect(main([makeBuildOfFiles(300)])).toBe(0);
    expect(printed(stdout)).toContain("Files: 300 of 300");
  });

  it("fails at 301 files with expected against actual", () => {
    expect(main([makeBuildOfFiles(301)])).toBe(1);
    const failure = printed(stderr);
    expect(failure).toContain("ERR_BUDGET_EXCEEDED");
    expect(failure).toContain("Expected: ≤ 300 files");
    expect(failure).toContain("Actual: 301 files");
  });

  it("passes an empty build", () => {
    expect(main([makeDirectory()])).toBe(0);
    expect(printed(stdout)).toContain("Files: 0 of 300");
  });
});

describe("the largest-files report", () => {
  it("lists only the 5 largest files, largest first", () => {
    const build = makeDirectory();
    writeSized(build, "a.bin", 10);
    writeSized(build, "b.bin", 70);
    writeSized(build, "nested/deep/c.bin", 60);
    writeSized(build, "d.bin", 20);
    writeSized(build, "e.bin", 50);
    writeSized(build, "f.bin", 40);
    writeSized(build, "g.bin", 30);

    expect(main([build])).toBe(0);
    const listed = printed(stdout)
      .split("\n")
      .filter((line) => line.startsWith("  "));
    expect(listed).toEqual([
      "  70 b.bin",
      "  60 nested/deep/c.bin",
      "  50 e.bin",
      "  40 f.bin",
      "  30 g.bin",
    ]);
  });

  it("lists the 5 largest files of a build that is over the budget", () => {
    const build = makeBuildOfFiles(301);
    writeSized(build, "big.bin", 9);

    expect(main([build])).toBe(1);
    const listed = printed(stderr)
      .split("\n")
      .filter((line) => line.startsWith("  "));
    expect(listed).toHaveLength(5);
    expect(listed[0]).toBe("  9 big.bin");
  });
});

describe("the directory argument", () => {
  it("defaults to apps/web/dist under the root", () => {
    const root = makeDirectory();
    writeSized(root, "apps/web/dist/index.html", 7);
    writeSized(root, "elsewhere/ignored.bin", 100);

    expect(main([], root)).toBe(0);
    const report = printed(stdout);
    expect(report).toContain("apps/web/dist");
    expect(report).toContain("Bytes: 7 of");
    expect(report).toContain("Files: 1 of");
  });

  it("resolves a relative directory against the root", () => {
    const root = makeDirectory();
    writeSized(root, "out/portal/index.html", 11);

    expect(main(["out/portal"], root)).toBe(0);
    expect(printed(stdout)).toContain("Bytes: 11 of");
  });

  it("fails with a pointer to pnpm build when the directory does not exist", () => {
    expect(main([], makeDirectory())).toBe(1);
    const failure = printed(stderr);
    expect(failure).toContain("ERR_BUDGET_NO_BUILD");
    expect(failure).toMatch(/^Next: .*`pnpm build`/m);
    expect(stdout).not.toHaveBeenCalled();
  });

  it("fails the same way when the path is a file", () => {
    const root = makeDirectory();
    writeSized(root, "apps/web/dist", 3);

    expect(main([], root)).toBe(1);
    expect(printed(stderr)).toContain("ERR_BUDGET_NO_BUILD");
  });

  it("rejects a second directory as bad usage, under the default root", () => {
    expect(main(["one", "two"])).toBe(2);
    expect(printed(stderr)).toContain("ERR_BUDGET_USAGE");
  });
});

describe("listFiles", () => {
  it("returns every file with its size, sorted by slash-separated path", () => {
    const build = makeDirectory();
    writeSized(build, "index.html", 4);
    writeSized(build, "assets/b.js", 2);
    writeSized(build, "assets/a.js", 3);
    writeSized(build, "assets/img/piñata-🎮.png", 1);
    mkdirSync(path.join(build, "empty"));

    expect(listFiles(build)).toEqual([
      { path: "assets/a.js", bytes: 3 },
      { path: "assets/b.js", bytes: 2 },
      { path: "assets/img/piñata-🎮.png", bytes: 1 },
      { path: "index.html", bytes: 4 },
    ]);
  });
});

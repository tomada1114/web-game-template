import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

// A repository cut from the template carries `.template-origin` (the bootstrap
// writes it); the template checkout never does. In a generated repository this
// test stays red until CLAUDE.md's `## Product` describes the game; in the
// template it stays red if the placeholder is filled, which would make the
// app-side rule vacuous for every game generated afterwards.

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const MEMORY_FILE = "CLAUDE.md";
const ORIGIN_FILE = ".template-origin";
const HEADING = "## Product";
// The colon is part of the marker, so a game about to-do lists can say "TODO".
const MARKER = "TODO:";

function productSectionProblems(root: string): string[] {
  const lines = readFileSync(path.join(root, MEMORY_FILE), "utf8").split("\n");
  const start = lines.indexOf(HEADING);
  if (start === -1) {
    return [`${MEMORY_FILE} has no "${HEADING}" heading.`];
  }
  const todos: string[] = [];
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (/^#{1,2}\s/.test(line)) {
      break;
    }
    if (line.includes(MARKER)) {
      todos.push(`${MEMORY_FILE}:${String(index + 1)}: ${line.trim()}`);
    }
  }
  if (existsSync(path.join(root, ORIGIN_FILE))) {
    return todos.map(
      (todo) => `${todo} — write ${HEADING} from the game's requirements.`,
    );
  }
  return todos.length > 0
    ? []
    : [
        `${MEMORY_FILE}'s ${HEADING} has no ${MARKER} line, but this is the template ` +
          `(no ${ORIGIN_FILE}); restore the placeholder lines.`,
      ];
}

describe(`${MEMORY_FILE} ${HEADING}`, () => {
  it("is written in a generated repository and a placeholder in the template", () => {
    expect(productSectionProblems(repoRoot)).toEqual([]);
  });
});

describe("the Product-section check on fixture trees", () => {
  const workspaces: string[] = [];

  afterEach(() => {
    for (const workspace of workspaces.splice(0)) {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  function tree(memory: string, generated: boolean): string {
    const root = mkdtempSync(path.join(tmpdir(), "product-section-"));
    workspaces.push(root);
    writeFileSync(path.join(root, MEMORY_FILE), memory);
    if (generated) {
      writeFileSync(path.join(root, ORIGIN_FILE), "template: fixture\n");
    }
    return root;
  }

  const placeholder = [
    "# Guide",
    "",
    "Intro.",
    "",
    HEADING,
    "",
    "TODO: What this game is, in one paragraph.  ",
    "TODO: Who it is for, and the core interaction.",
    "",
    "## Commands",
    "",
    "TODO: elsewhere.",
    "",
  ].join("\n");
  const written = [
    "# Guide",
    "",
    HEADING,
    "",
    "A puzzle about a TODO list, for commuters.",
    "",
    "## Commands",
    "",
    "TODO: elsewhere.",
    "",
  ].join("\n");

  it("passes in the template while a placeholder line remains", () => {
    expect(productSectionProblems(tree(placeholder, false))).toEqual([]);
  });

  it("fails in the template once the section is filled", () => {
    expect(productSectionProblems(tree(written, false))).toEqual([
      expect.stringContaining("restore the placeholder"),
    ]);
  });

  it("fails in a generated repository, naming every placeholder line", () => {
    expect(productSectionProblems(tree(placeholder, true))).toEqual([
      expect.stringMatching(/^CLAUDE\.md:7: TODO: What this game is/),
      expect.stringMatching(/^CLAUDE\.md:8: TODO: Who it is for/),
    ]);
  });

  it("fails in a generated repository with a single placeholder line left", () => {
    const one = written.replace("A puzzle", "TODO: A puzzle");
    expect(productSectionProblems(tree(one, true))).toEqual([
      expect.stringMatching(/^CLAUDE\.md:5: /),
    ]);
  });

  it("passes in a generated repository once the section is written", () => {
    expect(productSectionProblems(tree(written, true))).toEqual([]);
  });

  it.each([false, true])("fails without the heading (generated: %s)", (generated) => {
    const missing = written.replace(HEADING, "## Overview");
    expect(productSectionProblems(tree(missing, generated))).toEqual([
      expect.stringContaining('no "## Product" heading'),
    ]);
  });
});

// Only pnpm's own commands may appear in CLAUDE.md's Commands blocks without a
// script behind them; any other name there is a command an agent would run and
// watch fail.
const PNPM_BUILT_INS = new Set(["install", "exec"]);

function commandsSectionScripts(memory: string): string[] {
  const start = memory.indexOf("\n## Commands\n");
  if (start === -1) {
    return [];
  }
  const rest = memory.slice(start + 1);
  const next = rest.indexOf("\n## ", 1);
  const section = next === -1 ? rest : rest.slice(0, next);
  const names: string[] = [];
  for (const block of section.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)) {
    for (const match of (block[1] ?? "").matchAll(/\bpnpm ([a-z][\w:-]*)/g)) {
      const name = match[1] ?? "";
      if (!PNPM_BUILT_INS.has(name)) {
        names.push(name);
      }
    }
  }
  return names;
}

describe(`${MEMORY_FILE} ## Commands`, () => {
  it("names only scripts that package.json defines", () => {
    const memory = readFileSync(path.join(repoRoot, MEMORY_FILE), "utf8");
    const manifest = JSON.parse(
      readFileSync(path.join(repoRoot, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    const scripts = new Set(Object.keys(manifest.scripts ?? {}));
    const named = commandsSectionScripts(memory);

    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((name) => !scripts.has(name))).toEqual([]);
  });

  it("skips pnpm's own install and exec", () => {
    const memory = [
      "## Commands",
      "",
      "```sh",
      "pnpm install --frozen-lockfile",
      "pnpm exec vitest run",
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
    expect(commandsSectionScripts(`# Guide\n\n${memory}`)).toEqual(["budget"]);
  });
});

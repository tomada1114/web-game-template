import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { isolatedGitEnv } from "../scripts/lib/git-env.mjs";

// A malformed skill, rule or sub-agent tier is the one failure no other gate
// can see. Prettier formats the file and `typos` spell-checks it, so a SKILL.md
// whose `name` disagrees with its directory, a rule whose `paths` glob matches
// nothing, or a tier file whose `name` disagrees with its file passes every
// check and simply never loads in Claude Code. Nothing reports it; the
// guidance is just silently absent.
//
// The frontmatter this repository writes is deliberately small (a few plain
// scalars and one folded block scalar), so it is parsed here rather than by
// adding a YAML dependency for a file format the repository itself controls.
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const skillsDirectory = path.join(repoRoot, ".claude", "skills");
const rulesDirectory = path.join(repoRoot, ".claude", "rules");
const agentsDirectory = path.join(repoRoot, ".claude", "agents");

/**
 * The frontmatter keys a skill in this repository may declare. Claude Code
 * accepts a wider set; this repository keeps to these two.
 */
const ALLOWED_KEYS = ["name", "description"] as const;

/**
 * Selection is on the description's meaning, not on literal token match, so a
 * description carrying trigger keywords in a second language buys nothing and
 * contradicts the repository's English-only convention. CJK is the script that
 * would actually appear here.
 */
const NON_ENGLISH_SCRIPT = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef]/u;

/** Long enough for two sentences; short enough to survive host truncation. */
const DESCRIPTION_LIMIT = 600;

/** The four tiers that skills and `CLAUDE.md` hand work to, by role. */
const TIER_NAMES = ["architect", "executor", "scout", "worker"] as const;

/**
 * Frontmatter keys that change what a sub-agent may do. A tier file gives a
 * role its model and effort; a permission committed there would bind every
 * repository generated from this template to one person's trust.
 */
const PERMISSION_KEYS = ["tools", "permissionMode", "disallowedTools"] as const;

/**
 * The one permission key a tier file carries today. The tier files are copies
 * of a source outside this repository, and that source gives the read-only
 * tier a `disallowedTools` list, which only narrows what it can do. Remove
 * this entry when the source stops emitting the key; never add a tier or a
 * key to it to get a hand-edited tier file through.
 */
const GENERATED_PERMISSION_KEYS: Readonly<Record<string, readonly string[]>> = {
  scout: ["disallowedTools"],
};

function listSkillNames(): string[] {
  return readdirSync(skillsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Parse the frontmatter block of a SKILL.md or a `.claude/agents/*.md` tier
 * file into its declared keys.
 *
 * Supports the two forms this repository uses: a plain `key: value` scalar and
 * a folded block scalar (`key: >`) whose continuation lines are indented.
 *
 * @param {string} source - The full contents of a SKILL.md or tier file.
 * @returns {Record<string, string>} Every key declared in the frontmatter.
 * @throws {Error} When the file has no delimited frontmatter block, a line
 *   inside it is neither a key nor a continuation, a key is declared more than
 *   once, or a plain scalar value contains an unquoted ": ".
 */
function parseFrontmatter(source: string): Record<string, string> {
  const lines = source.split("\n");
  if (lines[0] !== "---") {
    throw new Error("SKILL.md does not open with a `---` frontmatter delimiter");
  }
  const end = lines.indexOf("---", 1);
  if (end === -1) {
    throw new Error("SKILL.md frontmatter is never closed by a `---` delimiter");
  }

  const fields: Record<string, string> = {};
  let currentKey: string | undefined;
  for (const line of lines.slice(1, end)) {
    if (line.trim() === "") continue;
    const keyed = /^([A-Za-z][\w-]*):[ \t]*(.*)$/u.exec(line);
    if (keyed) {
      const [, key = "", rawValue = ""] = keyed;
      if (key in fields) {
        throw new Error(`frontmatter declares "${key}" more than once`);
      }
      currentKey = key;
      // `>` and `>-` open a folded block; the value is on the lines below.
      if (rawValue === ">" || rawValue === ">-") {
        fields[key] = "";
        continue;
      }
      // An unquoted "key: value" plain scalar whose value itself contains
      // ": " is not valid YAML — a real parser reads the second colon as
      // nesting a mapping inside the value and rejects the line. Every skill
      // in this repository writes its description as a folded block scalar
      // for exactly this reason: a plain scalar that happened to work here
      // still breaks a real YAML loader (see openai/codex#8609).
      if (/:[ \t]/u.test(rawValue)) {
        throw new Error(
          `frontmatter value for "${key}" is a plain scalar containing an unquoted ": ", which is not valid YAML: ${line}`,
        );
      }
      fields[key] = rawValue.trim();
      continue;
    }
    if (currentKey === undefined || !line.startsWith(" ")) {
      throw new Error(`frontmatter line is neither a key nor a continuation: ${line}`);
    }
    const folded = fields[currentKey] ?? "";
    fields[currentKey] = folded === "" ? line.trim() : `${folded} ${line.trim()}`;
  }
  return fields;
}

/** The permission keys a parsed frontmatter block declares, in a fixed order. */
function declaredPermissionKeys(fields: Record<string, string>): string[] {
  return PERMISSION_KEYS.filter((key) => key in fields);
}

/**
 * Read the `paths:` list from a rule file's frontmatter.
 *
 * Supports the one shape this repository writes: `paths:` followed by
 * `  - "glob"` items, each a double-quoted string.
 *
 * @param {string} source - The full contents of a `.claude/rules/*.md` file.
 * @returns {string[]} The declared globs, in order.
 * @throws {Error} When the frontmatter is missing or unclosed, or a line
 *   inside it is not `paths:` or a quoted list item.
 */
function parseRulePaths(source: string): string[] {
  const lines = source.split("\n");
  if (lines[0] !== "---") {
    throw new Error("rule does not open with a `---` frontmatter delimiter");
  }
  const end = lines.indexOf("---", 1);
  if (end === -1) {
    throw new Error("rule frontmatter is never closed by a `---` delimiter");
  }
  const globs: string[] = [];
  let inPaths = false;
  for (const line of lines.slice(1, end)) {
    if (line.trim() === "") continue;
    if (line === "paths:") {
      inPaths = true;
      continue;
    }
    const item = /^[ \t]+-[ \t]+"([^"]+)"[ \t]*$/u.exec(line);
    if (inPaths && item) {
      globs.push(item[1] ?? "");
      continue;
    }
    throw new Error(`rule frontmatter line is not a quoted paths item: ${line}`);
  }
  return globs;
}

/**
 * Every file git would ship: tracked plus non-ignored untracked. Outside a git
 * repository (the bootstrap end-to-end copy is a plain directory), falls back
 * to a walk that skips installed and generated output.
 */
function listRepositoryFiles(): string[] {
  const result = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: repoRoot, encoding: "utf8", timeout: 30_000, env: isolatedGitEnv() },
  );
  if (result.status !== 0) {
    if (result.stderr.includes("not a git repository")) {
      return walkRepository();
    }
    throw new Error(`git ls-files failed: ${result.stderr}`);
  }
  return result.stdout.split("\0").filter(Boolean);
}

const WALK_SKIP = new Set([".git", "node_modules", "dist", "coverage"]);

function walkRepository(): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (WALK_SKIP.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else found.push(path.relative(repoRoot, absolute).replace(/\\/gu, "/"));
    }
  };
  walk(repoRoot);
  return found;
}

function readSkill(name: string): Record<string, string> {
  return parseFrontmatter(
    readFileSync(path.join(skillsDirectory, name, "SKILL.md"), "utf8"),
  );
}

function readTier(name: string): Record<string, string> {
  return parseFrontmatter(
    readFileSync(path.join(agentsDirectory, `${name}.md`), "utf8"),
  );
}

/** Every path under a skill directory, relative to that directory. */
function listSkillFiles(name: string): string[] {
  const root = path.join(skillsDirectory, name);
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else found.push(path.relative(root, absolute));
    }
  };
  walk(root);
  return found;
}

const skillNames = listSkillNames();
const ruleNames = readdirSync(rulesDirectory)
  .filter((name) => name.endsWith(".md"))
  .sort();

describe("the skill tree", () => {
  it("holds at least one skill", () => {
    expect(skillNames.length).toBeGreaterThan(0);
  });

  it.each(skillNames)("gives %s a SKILL.md at its root", (name) => {
    expect(statSync(path.join(skillsDirectory, name, "SKILL.md")).isFile()).toBe(true);
  });

  it.each(skillNames)("names %s's frontmatter after its directory", (name) => {
    expect(readSkill(name)["name"]).toBe(name);
  });

  it.each(skillNames)("declares only name and description in %s", (name) => {
    expect(Object.keys(readSkill(name)).sort()).toEqual([...ALLOWED_KEYS].sort());
  });

  it.each(skillNames)("gives %s a description Claude Code can match on", (name) => {
    const description = readSkill(name)["description"] ?? "";
    expect(description).not.toBe("");
    expect(description.length).toBeLessThanOrEqual(DESCRIPTION_LIMIT);
  });

  it.each(skillNames)("keeps %s's description in English", (name) => {
    expect(readSkill(name)["description"]).not.toMatch(NON_ENGLISH_SCRIPT);
  });

  it.each(skillNames)("keeps SKILL.md unique within %s", (name) => {
    // A SKILL.md below the skill root registers as a second, nameless skill.
    expect(
      listSkillFiles(name).filter((file) => path.basename(file) === "SKILL.md"),
    ).toEqual(["SKILL.md"]);
  });
});

describe("the sub-agent tiers", () => {
  // A step is handed to a tier by the `name` in its file and runs on that
  // file's model and effort, so a renamed file or a dropped key changes what
  // the step runs on without failing anything else.
  it("holds exactly the four tiers", () => {
    const tierFiles = readdirSync(agentsDirectory).filter((file) =>
      file.endsWith(".md"),
    );
    expect(tierFiles.sort()).toEqual(TIER_NAMES.map((name) => `${name}.md`));
  });

  it.each(TIER_NAMES)("names %s's frontmatter after its file", (name) => {
    expect(readTier(name)["name"]).toBe(name);
  });

  it.each(TIER_NAMES)("gives %s a description, a model and an effort", (name) => {
    const tier = readTier(name);
    expect(tier["description"] ?? "").not.toBe("");
    expect(tier["model"] ?? "").not.toBe("");
    expect(tier["effort"] ?? "").not.toBe("");
  });

  it.each(TIER_NAMES)("declares no unexcused permission key in %s", (name) => {
    expect(declaredPermissionKeys(readTier(name))).toEqual(
      GENERATED_PERMISSION_KEYS[name] ?? [],
    );
  });
});

describe("declaredPermissionKeys", () => {
  it("reports nothing for a tier that sets only its role, model and effort", () => {
    const source = "---\nname: a\ndescription: b\nmodel: c\neffort: d\n---\n";
    expect(declaredPermissionKeys(parseFrontmatter(source))).toEqual([]);
  });

  it.each(PERMISSION_KEYS)("reports a declared %s", (key) => {
    const source = `---\nname: a\n${key}: Read, Grep\n---\n`;
    expect(declaredPermissionKeys(parseFrontmatter(source))).toEqual([key]);
  });

  it("reports every permission key a tier declares", () => {
    const source = "---\nname: a\ndisallowedTools: Edit\ntools: Read\n---\n";
    expect(declaredPermissionKeys(parseFrontmatter(source))).toEqual([
      "tools",
      "disallowedTools",
    ]);
  });
});

describe("the path-scoped rules", () => {
  // A rule loads only when a file matching one of its globs is read, so a
  // glob that matches nothing silently disables the rule.
  const repositoryFiles = listRepositoryFiles();

  it("holds at least one rule", () => {
    expect(ruleNames.length).toBeGreaterThan(0);
  });

  it.each(ruleNames)("gives %s a non-empty paths list", (name) => {
    const globs = parseRulePaths(readFileSync(path.join(rulesDirectory, name), "utf8"));
    expect(globs.length).toBeGreaterThan(0);
  });

  it.each(ruleNames)(
    "matches at least one repository file with each glob in %s",
    (name) => {
      const globs = parseRulePaths(
        readFileSync(path.join(rulesDirectory, name), "utf8"),
      );
      for (const glob of globs) {
        expect(
          repositoryFiles.some((file) => path.matchesGlob(file, glob)),
          `${name}: ${glob} matches no file`,
        ).toBe(true);
      }
    },
  );
});

describe("parseRulePaths", () => {
  it("reads quoted list items", () => {
    expect(parseRulePaths('---\npaths:\n  - "src/**/*.ts"\n  - "a.md"\n---\n')).toEqual(
      ["src/**/*.ts", "a.md"],
    );
  });

  it("rejects a file with no frontmatter", () => {
    expect(() => parseRulePaths("# Rule\n")).toThrow(/frontmatter delimiter/u);
  });

  it("rejects frontmatter that is never closed", () => {
    expect(() => parseRulePaths('---\npaths:\n  - "a"\n')).toThrow(/never closed/u);
  });

  it("rejects an unquoted item or another key", () => {
    expect(() => parseRulePaths("---\npaths:\n  - a\n---\n")).toThrow(/quoted paths/u);
    expect(() => parseRulePaths("---\nname: x\n---\n")).toThrow(/quoted paths/u);
  });

  it("rejects a list item before the paths key", () => {
    expect(() => parseRulePaths('---\n  - "a"\n---\n')).toThrow(/quoted paths/u);
  });
});

describe("parseFrontmatter", () => {
  it("reads a plain scalar", () => {
    expect(parseFrontmatter("---\nname: a-skill\n---\n# Title\n")).toEqual({
      name: "a-skill",
    });
  });

  it("folds a block scalar onto one line", () => {
    const source = "---\nname: a\ndescription: >\n  First line\n  second line.\n---\n";
    expect(parseFrontmatter(source)["description"]).toBe("First line second line.");
  });

  it("folds a stripped block scalar the same way", () => {
    const source = "---\nname: a\ndescription: >-\n  Only line.\n---\n";
    expect(parseFrontmatter(source)["description"]).toBe("Only line.");
  });

  it("rejects a file with no frontmatter", () => {
    expect(() => parseFrontmatter("# Title\n")).toThrow(/frontmatter delimiter/u);
  });

  it("rejects frontmatter that is never closed", () => {
    expect(() => parseFrontmatter("---\nname: a\n")).toThrow(/never closed/u);
  });

  it("rejects a line that is neither a key nor a continuation", () => {
    expect(() => parseFrontmatter("---\n- stray\n---\n")).toThrow(/neither a key/u);
  });

  it("rejects a plain scalar value with an unquoted colon-space", () => {
    // Valid YAML would read the second colon as opening a nested mapping;
    // real parsers reject or mangle it, so a scalar shaped like this must
    // never be accepted here either. See openai/codex#8609.
    expect(() =>
      parseFrontmatter("---\nname: a\ndescription: bad: value\n---\n"),
    ).toThrow(/unquoted ": "/u);
  });

  it.each(skillNames)(
    "parses %s's real frontmatter without an unquoted colon-space in a plain scalar",
    (name) => {
      // Every skill today writes its description as a folded block scalar,
      // so this should never fire — it exists to catch a future skill that
      // reverts to a plain scalar and reintroduces the invalid shape above.
      expect(() => readSkill(name)).not.toThrow();
    },
  );

  it("rejects frontmatter that declares the same key twice", () => {
    expect(() =>
      parseFrontmatter("---\nname: a\ndescription: one\ndescription: two\n---\n"),
    ).toThrow(/more than once/u);
  });

  it("rejects a folded key that is declared twice", () => {
    const source =
      "---\nname: a\ndescription: >\n  First.\ndescription: >\n  Second.\n---\n";
    expect(() => parseFrontmatter(source)).toThrow(/more than once/u);
  });
});

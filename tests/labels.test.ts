import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseLabelManifest } from "../scripts/lib/labels-manifest.mjs";

// `.github/labels.yml` is the single declarative source for this
// repository's label taxonomy (the `triaging-issues` skill).
// This is a static, filesystem-only check: a form or the release manifest
// must not be able to name a label the manifest does not declare, so GitHub
// does not silently drop it (the `triaging-issues` skill warns about exactly that).

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const githubDir = path.join(repoRoot, ".github");

/**
 * Pull every label named inside a `labels: [...]` flow sequence, quoted or
 * not (issue templates quote their entries; release.yml does not).
 */
function extractLabelArrays(text: string): string[] {
  const labels: string[] = [];
  const pattern = /labels:\s*\[([^\]]*)\]/g;
  for (const match of text.matchAll(pattern)) {
    const inner = match[1] ?? "";
    for (const raw of inner.split(",")) {
      const trimmed = raw.trim();
      if (trimmed === "") {
        continue;
      }
      labels.push(trimmed.replace(/^["']/, "").replace(/["']$/, ""));
    }
  }
  return labels;
}

/**
 * The label each row of the `triaging-issues` skill's tables defines: the
 * backticked name in the row's first cell.
 */
function extractDefinedLabels(skill: string): string[] {
  return [...skill.matchAll(/^\| `([^`]+)`\s*\|/gm)].map((match) => match[1] ?? "");
}

describe("label taxonomy", () => {
  const manifest = parseLabelManifest(
    readFileSync(path.join(githubDir, "labels.yml"), "utf8"),
  );
  const manifestNames = new Set(manifest.map((label) => label.name));

  it("declares at least one label", () => {
    expect(manifest.length).toBeGreaterThan(0);
  });

  it("declares a unique name for every label", () => {
    expect(manifestNames.size).toBe(manifest.length);
  });

  it.each(manifest.map((label) => [label.name, label] as const))(
    "%s has a six-digit hex color and a non-empty description",
    (_name, label) => {
      expect(label.color).toMatch(/^[0-9a-f]{6}$/);
      expect(label.description.length).toBeGreaterThan(0);
    },
  );

  // Without these two, an issue only its owner can act on and a checklist of
  // sub-issues have nothing to carry but `on hold`, which `shipping-issues`
  // reads as real work that is merely parked.
  it.each(["blocked: external", "tracking"])("declares %s", (name) => {
    expect(manifestNames.has(name)).toBe(true);
  });

  // The manifest holds a label's name and colour; the skill holds what it
  // means. A label in one and not the other is either applied without a
  // meaning or defined and silently dropped by GitHub.
  const triagingSkill = readFileSync(
    path.join(repoRoot, ".claude", "skills", "triaging-issues", "SKILL.md"),
    "utf8",
  );

  it.each([...manifestNames])("%s is named in the triaging-issues skill", (name) => {
    expect(triagingSkill).toContain(`\`${name}\``);
  });

  it("declares every label the triaging-issues skill's tables define", () => {
    const defined = extractDefinedLabels(triagingSkill);
    expect(defined.length).toBeGreaterThan(0);
    expect(defined.filter((name) => !manifestNames.has(name))).toEqual([]);
  });

  const issueTemplateDir = path.join(githubDir, "ISSUE_TEMPLATE");
  const templateFiles = readdirSync(issueTemplateDir).filter(
    (name) => name.endsWith(".yml") && name !== "config.yml",
  );

  it("found at least one issue form to check", () => {
    expect(templateFiles.length).toBeGreaterThan(0);
  });

  it.each(templateFiles)(
    ".github/ISSUE_TEMPLATE/%s's labels are all declared in .github/labels.yml",
    (file) => {
      const text = readFileSync(path.join(issueTemplateDir, file), "utf8");
      const labels = extractLabelArrays(text);
      expect(labels.length, `${file} has no labels: [...] field`).toBeGreaterThan(0);
      for (const label of labels) {
        expect(
          manifestNames.has(label),
          `${file} uses "${label}", which .github/labels.yml does not declare`,
        ).toBe(true);
      }
    },
  );

  it("every label in .github/release.yml's changelog categories is declared in .github/labels.yml", () => {
    const text = readFileSync(path.join(githubDir, "release.yml"), "utf8");
    const labels = extractLabelArrays(text);
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(
        manifestNames.has(label),
        `.github/release.yml uses "${label}", which .github/labels.yml does not declare`,
      ).toBe(true);
    }
  });
});

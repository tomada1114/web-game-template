import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// This file exists for exactly one reason: to hold assertions that describe
// this checkout's *pre-bootstrap* state — the lightweight `bootstrap:` job in
// ci.yml and this template's default `>=24` Node floor — neither of which
// has to hold once `scripts/bootstrap.mjs` has run. `scripts/bootstrap.mjs`'s `SELF_REMOVED_PATHS` deletes this file
// alongside its own script and `tests/bootstrap.test.ts`, so a generated
// repository never sees it. Everything else that used to live next to these
// assertions in `tests/workflows.test.ts` reads its expectations from the
// repository it is checking (package.json, ci.yml) instead of a literal, and
// so stays behind to guard generated repositories too — see that file's
// `describe("workflow regression checks for repository automation", ...)`.
//
// A test added here is a test bootstrap:e2e cannot see failing on its own —
// `scripts/verify-bootstrap.mjs`'s `assertGenerated()` never runs the
// generated suite. Prefer extending `assertGenerated()` or a profile-derived
// assertion in a surviving test file over adding to this one.

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const workflowsDir = path.join(repoRoot, ".github", "workflows");

function workflowSource(name: string): string {
  return readFileSync(path.join(workflowsDir, name), "utf8");
}

describe("this checkout's own bootstrap tooling", () => {
  it("runs the generated repositories' full checks in CI", () => {
    const source = workflowSource("ci.yml");
    const bootstrapStart = source.indexOf("  bootstrap:");
    const blockEnd = source.indexOf("# template-only:end", bootstrapStart);
    const bootstrapJob = source.slice(bootstrapStart, blockEnd);
    expect(bootstrapJob).toContain("pnpm run bootstrap:check");
    expect(bootstrapJob).toContain("pnpm install --frozen-lockfile");
    expect(source).not.toContain("pnpm run bootstrap:e2e");
    expect(source.toLowerCase()).not.toContain("change" + "set");
  });

  it("carries no package-floor job or node-floor marker for bootstrap to rewrite", () => {
    const source = workflowSource("ci.yml");
    expect(source).not.toContain("  package-floor:");
    expect(source).not.toContain("# bootstrap-node-floor");
  });

  it("keeps the template's default Node floor explicit", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(repoRoot, "package.json"), "utf8"),
    ) as { engines?: { node?: string } };
    expect(manifest.engines?.node).toBe(">=24");
  });
});

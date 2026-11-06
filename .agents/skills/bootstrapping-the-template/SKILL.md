---
name: bootstrapping-the-template
description: >
  Covers the bootstrap flow that turns this template into a fresh repository:
  scripts/bootstrap.mjs, scripts/verify-bootstrap.mjs, tests/bootstrap.test.ts,
  tests/verify-bootstrap.test.ts, tests/template-self.test.ts, and pnpm bootstrap:e2e.
  Use when changing what bootstrap prompts for, transforms, or removes; touching
  PLACEHOLDER_TARGETS, MARKER_TARGETS, AI_LAYER_TARGETS, or
  DANGLING_REFERENCE_EXEMPTIONS; or debugging ERR_AI_LAYER_REFERENCE,
  ERR_BOOTSTRAP_SCRIPT_REMAINING, or a bootstrap:e2e failure.
---

# Bootstrapping the Template

**Owns:** the bootstrap flow — `scripts/bootstrap.mjs`, `scripts/verify-bootstrap.mjs`,
`tests/bootstrap.test.ts`, `tests/verify-bootstrap.test.ts`,
`tests/template-self.test.ts`, and `pnpm bootstrap:e2e`. **Does not own:** the general
`.mjs` import/typing/git-safety contract every script under `scripts/` follows
(`writing-repo-scripts`); test-body conventions (`writing-tests`); where a test file
lives or its coverage floor (`placing-tests`).

## The flow end to end

`scripts/bootstrap.mjs` turns a fresh clone of this template into a real repository,
once. The template has one shape, so bootstrap asks no shape question. `main()` collects
the metadata — interactively via `promptArguments`, or non-interactively from
`<package-name>` plus the `--author`/`--github-user`/`--license` flags and an optional
`--description` (`parseArguments`) — then calls `bootstrap(root, options)`. Any other
option, including one given before the package name, fails with `ERR_ARGUMENT_UNKNOWN`.

`bootstrap()` runs `transform()` twice: once as a dry-run into an in-memory `preview`
Map (never touching disk), then for real only after the dry-run passes every check
(`findPlaceholders`, `assertGeneratedAiLayer`). `transform()` itself:

- Removes its own five files — `scripts/bootstrap.mjs`, `scripts/verify-bootstrap.mjs`,
  `tests/bootstrap.test.ts`, `tests/verify-bootstrap.test.ts`,
  `tests/template-self.test.ts` — see "The self-removal property" below.
- Removes the sample command entry `src/cli.ts` and its test `tests/cli.test.ts`.
- Rewrites `PLACEHOLDER_TARGETS` (template package name, repo, author, description, the
  README license link) and strips `template-only` Markdown and YAML blocks from
  `MARKER_TARGETS`.
- Rewrites `package.json` (name, version, description, license, author name, repository,
  `bugs`, `homepage`, no `bin`, `sideEffects: false`) and drops the `bootstrap:e2e` and
  `bootstrap:check` script entries. `engines` and `tsconfig.build.json` keep the
  template's own values.
- Regenerates `LICENSE` and a bare `CHANGELOG.md`.

`scripts/verify-bootstrap.mjs`, run as `pnpm bootstrap:e2e`, is the flow's own
integration test: `main()` builds a throwaway workspace with `copyTemplate()` (see
below), runs a real `scripts/bootstrap.mjs` subprocess, and calls `assertGenerated()`
against the result — placeholders gone, no bootstrap marker left in `MARKER_TARGETS`, no
Skills row naming a missing skill, the legacy release directory absent,
`scripts/bootstrap.mjs` itself gone, a bare changelog, and the expected `package.json`
shape (name, `0.0.0`, no `bin`, `sideEffects: false`).

A test that survives bootstrap (i.e. is not in `SELF_REMOVED_PATHS`) must never assert a
literal that is only true of this checkout before bootstrap runs — the whole point of
`tests/template-self.test.ts` existing is to be the one place such assertions are
allowed. A surviving test instead derives its expectation from the file it is reading
(`package.json`, the job a workflow still carries). `pnpm bootstrap:e2e` checks the
transformation; `pnpm bootstrap:check` also installs and runs the generated repository's
full gate, catching tests that retain template-only assumptions.

## The self-removal property

A real bootstrap run deletes `scripts/bootstrap.mjs`, `scripts/verify-bootstrap.mjs`,
both of their test files, and `tests/template-self.test.ts` from the generated
repository. That means the **generated tree** — not this checkout — is the thing a
bootstrap change is really tested against; a check that only ever runs against this
checkout can never see what it looks like once those five files are gone.

That is why both `tests/bootstrap.test.ts` and `scripts/verify-bootstrap.mjs` build
their fixture from `git ls-files` (`copyTemplate` in `scripts/verify-bootstrap.mjs`,
reused by `tests/bootstrap.test.ts` as `copyTrackedFiles`) rather than copying the
working directory: it includes tracked files and non-ignored new files, so proposed
additions are checked before commit, with no local ignored build output mixed in.

That gap is also the trap: a check that consults the real filesystem can render a
different verdict against a built checkout (where `dist/` exists) than against a freshly
generated tree (where it doesn't). `namesGeneratedTreeEntry` in `scripts/bootstrap.mjs`
is the rule that closes this for the dangling-reference check specifically — read its
doc comment for the exact shape test and the accepted residual it documents; this was
the actual defect behind issue #106.

This skill itself is part of `SELF_REMOVED_PATHS`, alongside the five files above: a
generated repository has no bootstrap flow left to run or maintain, so a skill
documenting that flow would otherwise survive with nothing left to describe. Removing a
directory entry recursively marks every nested file absent in the dry-run `preview` map
before the real removal runs, so the dangling-reference scan never reads its now-stale
content from disk. AGENTS.md's own Quick reference line and Skills-table row for this
skill are removed the same way, by a small `SELF_REMOVED_AGENTS_LINES` regex list
applied inside `replaceText` — a GFM table row can't be wrapped in the
`<!-- template-only:-->` block markers used elsewhere (an HTML comment or a resulting
blank line both terminate a table early), so the whole line, trailing newline included,
is matched and dropped directly instead.

`scripts/verify-bootstrap.mjs`'s `assertGenerated` closes the loop this is really for:
it re-parses the generated tree's own AGENTS.md Skills table
(`listRoutingTableSkillNames`) and throws `ERR_BOOTSTRAP_STALE_SKILL_ROUTE` if any row
names a skill directory the generated tree does not have — the same invariant
`tests/skills-frontmatter.test.ts` checks in this checkout, checked again in the tree
that actually ships. This is the second time a bootstrap check has been weaker in one
environment than the other (the first was #106's `namesGeneratedTreeEntry`), so a change
that adds a self-removed path or an AGENTS.md line tied to it owes both sides: the
removal itself, and, if it changes what AGENTS.md's Skills table can say, this check.

## The dangling-reference check

`assertGeneratedAiLayer` (called from `bootstrap()`, raising `ERR_AI_LAYER_REFERENCE`)
scans every Markdown file in the generated tree for a backticked, repo-relative path
token and fails if that token names neither a real entry in the generated tree nor an
entry in `DANGLING_REFERENCE_EXEMPTIONS`. It exists to catch a Markdown reference to a
file bootstrap itself just removed, or to a file a change deleted while a kept skill
still names it. Markdown under `docs/product/` and `docs/design/` is skipped
(`MARKDOWN_SCAN_SKIP_PATHS`), because those planning records describe paths later work
is intended to create.

A change to the template's own Markdown (AGENTS.md, README.md, a skill, ...) that adds a
backticked path owes this check one of two things: the path must resolve in the
generated tree, or, if it legitimately never exists in a generated tree (gitignored
build output, a documented-but-unshipped pattern), it belongs in
`DANGLING_REFERENCE_EXEMPTIONS` — read that constant's own comment before adding to it,
since each existing entry documents why it's there. A skill that is only drafted (under
`docs/design/skill-drafts/`) is named by its bare name, never by a `.agents/skills/`
path, so the scan has nothing to resolve.

## How to verify a bootstrap change

Reach for `pnpm exec vitest run tests/bootstrap.test.ts` first — it exercises
`bootstrap()`, `parseArguments`, `findPlaceholders`, and the dangling-reference check
directly, against fixtures built the same `git ls-files` way described above, without
paying for a real subprocess run.

`pnpm bootstrap:e2e` exercises the real command whenever a change could only show up in
a real, end-to-end run: a change to `copyTemplate`/`assertCopyable`'s file-copying
behavior, anything that could make the CLI's interactive or non-interactive argument
path diverge from what the unit tests inject directly, or as a final check before
believing a removal-list change is actually safe. It is slower — it runs
`scripts/bootstrap.mjs` as a real subprocess against a real temporary workspace — which
is why it isn't the first thing to reach for. Before finishing a generation change, run
`pnpm bootstrap:check` to install the generated repository and run its full gate. A
successful workspace is removed; a failed one remains at the reported path.

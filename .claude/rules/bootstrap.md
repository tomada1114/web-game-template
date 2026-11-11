---
paths:
  - "scripts/bootstrap.mjs"
  - "scripts/verify-bootstrap.mjs"
  - "tests/bootstrap.test.ts"
  - "tests/verify-bootstrap.test.ts"
  - "tests/template-self.test.ts"
---

# The bootstrap flow (template only)

`scripts/bootstrap.mjs` turns a fresh copy of this template into a named repository,
once. It collects metadata (interactively, or from `<slug>` plus `--title` and the other
flags), runs `transform()` as a dry run into an in-memory preview, and repeats it for
real only after the preview passes `findPlaceholders` and `assertGeneratedAiLayer`.

## The generated tree is what is under test

- Bootstrap deletes itself: everything in `SELF_REMOVED_PATHS`, which includes this
  rule. A check that only runs against this checkout cannot see the result, so
  `tests/bootstrap.test.ts` and `scripts/verify-bootstrap.mjs` build their fixture from
  `git ls-files` (tracked plus non-ignored new files) rather than the working directory.
- A check that consults the real filesystem can answer differently in a built checkout
  (where `dist/` exists) than in a fresh tree. `namesGeneratedTreeEntry` closes that for
  the dangling-reference check; read its comment before touching it.
- A test that survives bootstrap must not assert a literal that is only true before
  bootstrap runs. `tests/template-self.test.ts` is the one place for those; a surviving
  test derives its expectation from the file it reads.
- Template-only text in a file listed in `MARKER_TARGETS` sits between
  `<!-- template-only:start -->` and `<!-- template-only:end -->` (or the `#` form in
  YAML). Anything else that exists only for the template is registered in
  `SELF_REMOVED_PATHS`.

## The dangling-reference check

`assertGeneratedAiLayer` (`ERR_AI_LAYER_REFERENCE`) scans the generated tree's Markdown
for backticked repository paths and fails on one that names nothing there. Markdown
under `docs/product/` and `docs/design/` is skipped. Adding a backticked path to
`CLAUDE.md`, a rule, a skill, or the README owes one of two things: the path resolves in
the generated tree, or it is added to `DANGLING_REFERENCE_EXEMPTIONS` with the reason
that constant's comment asks for.

## Rules of the flow

- Placeholders fail the checks until filled and never get a default. Name, author, and
  description come from the user or the kickoff, never invented.
- Unknown options fail with `ERR_ARGUMENT_UNKNOWN`.
- The slug is lowercase kebab case, never scoped; it names the root package and scopes
  the workspace packages (`@<slug>/core`, `@<slug>/web`). Slug and title are capped so
  the constants in `apps/web/src/game-info.ts` stay on one line at Prettier's width, and
  the title refuses characters a TypeScript literal or HTML text would need rewritten.
- Every file that carries the slug or title is a `PLACEHOLDER_TARGETS` entry, including
  `pnpm-lock.yaml` (its `apps/web` importer names the core package) and any module that
  imports a workspace package by its `@my-game/` name. A missed one fails
  `ERR_WORKSPACE_NAME` or `ERR_GAME_RENAME_MISSING` in the verifier.

## Verifying a change

1. `pnpm exec vitest run tests/bootstrap.test.ts` — fast, in-process.
2. `pnpm bootstrap:e2e` — the real command as a subprocess on a throwaway copy; needed
   when file copying, argument parsing, or a removal list changed.
3. `pnpm bootstrap:check` before finishing — installs the generated repository and runs
   its full gate. A failed workspace is kept at the reported path.

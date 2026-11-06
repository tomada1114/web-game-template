---
name: placing-tests
description: >
  Decides where a new test file goes — packages/core/test/, apps/web/test/, or tests/ —
  which vitest.config.ts project (core, web, unit, automation) it joins, and which
  coverage.thresholds floor (packages/core/src/**, apps/web/src/**, scripts/**,
  scripts/lib/guard/**) governs it. Use when adding a *.test.ts file, running one
  project with --project, choosing between `pnpm exec vitest run` and `pnpm
  test:coverage`, or a coverage run drops below a floor.
---

# Placing Tests

**Owns:** where a new test file goes, which vitest project it joins, and the coverage
floors that govern it. **Does not own:** how the test itself is written, assertion
style, and fixtures (`writing-tests`).

## Location

A test lives beside the layer it covers, never next to the source file it covers:

- `packages/core/test/` — core's tests, importing core through `../src/index.js`.
- `apps/web/test/` — tests of `apps/web`'s pure helpers. The web entry and its scenes
  run only in a real browser, which the boot smoke test drives, not Vitest.
- `tests/` — repository automation, the tool configs, and the workflows; the boot smoke
  test will live in an e2e directory beside them.

Name the file after the module it covers, `<module>.test.ts`.

- `tests/fixtures/` is reserved for data under test, not test modules. Keep executable
  assertions in a `*.test.ts` file.
- Nothing under `tests/fixtures/` is linted, formatted, type-checked, spell-checked, or
  collected as a test — `eslint.config.mjs`, `.prettierignore`, `tsconfig.json`,
  `typos.toml` and `vitest.config.ts` all skip it, and `tests/tooling-ignores.test.ts`
  holds the five together. That is what makes the tree usable for a fixture that is
  _meant_ to be malformed or to fail, or for a whole project belonging to another
  toolchain, driven from an `automation` test as a child process.

## Choosing a project

`vitest.config.ts` defines four `test.projects`. Two follow from where the file lives:

- **`core`** — every `*.test.ts` under `packages/core/test/`.
- **`web`** — every `*.test.ts` under `apps/web/test/`.

Run one with `pnpm exec vitest run --project core` (or `web`); there are no per-package
test scripts. Both carry the short unit budget: a workspace test touches no filesystem,
subprocess, or git.

A file under `tests/` joins `unit` or `automation`, and that placement is a decision you
make from what the file touches, never from its name. The unit project includes
`tests/**/*.test.ts` by default; the automation project is the explicit
`automationTests` list at the top of `vitest.config.ts`. A new test therefore starts in
`unit`, and you add its path to `automationTests` when it needs I/O. Choose between them
by:

- **`unit`** — the test calls only pure functions (the guard engine's own tests are the
  example) and touches no filesystem, subprocess, or git.
- **`automation`** — everything else: any test that shells out, reads or writes a temp
  directory, or spawns `git`/`node`.

The two directions fail differently, which is the point of listing `automation`
explicitly. Forgetting to register a test that does I/O leaves it in `unit`, where the
5-second budget makes it time out loudly rather than pass on a budget nobody chose.
Listing a pure test in `automationTests` is the quiet mistake: it still passes, just on
a budget far longer than it needs. Keep pure tests in the default unit project and edit
the explicit `automationTests` list when a test gains filesystem, subprocess, or git
work.

- **Why the timeouts differ:** a `unit` test has no I/O, so if it hangs the only
  possible cause is an infinite loop or an unresolved promise, and a short timeout
  surfaces that in seconds. An `automation` test legitimately needs the long budget for
  a real subprocess or temp-directory operation — giving it the short one would make
  correct tests flaky.

## Coverage floors

`coverage.include` in `vitest.config.ts` lists the workspace packages' source and
`scripts/**/*.mjs` on purpose: a file with no test still counts toward the denominator
at 0% instead of vanishing from it. A new file is covered from the moment it exists —
write its test in the same PR, not as follow-up. The one exclusion is the web entry and
its scenes, which only the boot smoke test can reach.

Each layer has an independent threshold set, not one shared number, because each answers
a different question:

- **`packages/core/src/**`** — the deterministic rules every recorded result depends on
  — carries the highest floor.
- **`apps/web/src/**`** carries the baseline floor for the web shell's own helpers.
- **`scripts/**`** was never measured before it was added to `coverage.include`, so its
  floor is the last measured coverage rounded down to a clean value, not a guessed
  target — it has been raised as coverage grew (see the dated comments in
  `vitest.config.ts`). Raise it again as real coverage grows; never invent a number
  ahead of the measurement.
- **`scripts/lib/guard/**`** — the credential and path detection rule engine, the most
  security-critical code in the repository — carries its own higher floor on lines,
  functions, and statements, so it cannot regress just because it is dragged along by
  whatever number the broader `scripts/**` tree happens to sit at. The two trees' branch
  floors are set independently in `vitest.config.ts` and are raised as each tree's own
  measured branch coverage grows, so do not assume one bounds the other.

See `vitest.config.ts`'s `coverage.thresholds` for the current numbers; this skill
deliberately does not repeat them, since a copied number goes stale the moment the
config changes.

**Coverage stops at the process boundary.** The v8 provider instruments the Vitest
workers and nothing else, so a module that only ever executes inside a process the test
spawns reports 0% however thoroughly the integration test exercises it — and 0% against
an 80% floor fails the run. Design for it rather than discovering it: keep the part that
runs in the child thin and put the logic behind it in a module the test can also call
in-process.

- **Branch coverage is the one that matters.** Cover both sides of a conditional rather
  than adding a trivial test whose only effect is moving a line/statement percentage.
- **A floor is never lowered, and no file is added to `coverage.exclude` to move a
  number** — AGENTS.md's "Security and human approval" holds that prohibition for every
  agent, including one whose task is only "make CI green." What this skill owns is which
  floor applies and why.

## Commands

```bash
pnpm exec vitest run --project core         # one project (or web, unit, automation)
pnpm exec vitest run <path>                  # one file, fast iteration
pnpm test:coverage                           # full suite with floors enforced
```

If `pnpm test:coverage` fails on a floor, add real coverage for the uncovered branch —
do not adjust the threshold or the include list.

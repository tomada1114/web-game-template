---
name: tdd
description: >
  Use when changing behavior under packages/core/src/, apps/web/src/, or scripts/, or
  fixing a bug: adding a rule, a pure helper, or a script command, or when a test
  written after the code only restates it. Covers which surface the test drives, the
  failing test before the implementation, proving with pnpm exec vitest run --project
  that it fails for the right reason (not "Cannot find module", not "No test files
  found"), the smallest change that turns it green, refactoring with the tests on, the
  regression test a bug fix starts from, and landing test and code in one commit.
---

# Test-Driven Development

**Owns:** the order of work on a behavior change: which surface the test drives, the
failing test before the code, the proof that it fails, the smallest change that passes,
the refactor, and the commit. **Does not own:** where a test file goes, how its body is
written, and the coverage floors (`.claude/rules/tests.md`); the conventions of a script
(`.claude/rules/scripts.md`) or a workspace module (`.claude/rules/typescript.md`); the
commit itself (`smart-commit`).

A test written after the code asserts whatever the code happens to do. It passes on its
first run, so nothing ever showed it can fail, and every gate is green over a test that
cannot tell right from wrong. Writing it first and watching it fail is the cheap way to
know it can.

A change with no behavior (a rename, a comment, a reformat) needs no new test; the tests
that already cover the code are its check.

## Which surface the test drives

Decide this before the test: the layer decides the surface and the Vitest project.

| The change is in                 | The test drives                                                                                          | Test directory        | Project                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------- |
| `packages/core/src/`             | an exported function, imported through core's index, with plain values in                                | `packages/core/test/` | `core`                                                                       |
| a pure helper in `apps/web/src/` | the helper's export                                                                                      | `apps/web/test/`      | `web`                                                                        |
| `scripts/`                       | the command's exported entry (`main()`, or a named one): arguments in; exit code, stdout, and stderr out | `tests/`              | `unit`, or `automation` once it touches the filesystem, a subprocess, or git |

- A decision (a rule, a calculation, a state transition) goes in `packages/core/src/`.
  Whatever is random or timed enters as an argument, so the test passes a fixed seed or
  a fixed timestamp and expects one exact result.
- The `automation` project runs only the files named in `automationTests` in
  `vitest.config.ts`; every other file under `tests/` runs in `unit`, under its 5-second
  timeout. Add a new filesystem, subprocess, or git test to that list before its red
  run, or `--project automation` reports "No test files found" and the test runs under
  the unit timeout instead.
- No Vitest project reaches the browser entry, `apps/web/src/main.ts`. Move what has to
  be decided there into a pure helper or into core, and test that.

## Red: the test first

- Write the test for the behavior a caller observes, through the surface above, before
  touching the code.
- Write the edge cases now, as `it.each` cases. A case added after green is written
  against what the code returns, which is the failure this order exists to prevent.
- One behavior per cycle. A batch of tests followed by a batch of code leaves no single
  red to attribute to a single change.

## Prove it fails, for the right reason

Run the one file from the repository root, in its project, and read the failure. Red
alone is not the proof; the reason is.

```sh
pnpm exec vitest run --project core packages/core/test/<module>.test.ts
pnpm exec vitest run --project core packages/core/test/<module>.test.ts -t "<describe> <it>"
```

| The run reports                                                                                                                       | Counts as red                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `AssertionError` with its `Expected` / `Received` diff, under `Failed Tests`                                                          | yes: the only red that counts for a behavior change                          |
| An error a stub throws from inside the test (`Error: not implemented`), or `TypeError: <name> is not a function` for a missing export | yes, for code that does not exist yet                                        |
| `Error: Cannot find module` under `Failed Suites`, with `Tests  no tests`                                                             | no: the file never ran; add the module with a stub export                    |
| `Error: Transform failed` with a `PARSE_ERROR`, under `Failed Suites`                                                                 | no: the test file does not parse; fix it and run again                       |
| `No test files found, exiting with code 1`                                                                                            | no: the path names no test file in that project; fix the path or `--project` |
| Every test `skipped`, with exit code 0                                                                                                | no: the `-t` pattern matched nothing                                         |
| Green                                                                                                                                 | no: the test does not cover the change; rewrite it                           |

Vitest does not type-check: a test that assigns a string to a `number` runs and passes,
and a name imported from a module that does not export it is `undefined` at run time. A
type error is `pnpm typecheck`'s, never the red this run proves.

Never skip this run, even when the failure looks certain. A test that has never failed
has proven nothing.

## Green: the smallest change that passes

- Write only what the failing test demands. A branch no test asks for waits for the test
  that does.
- Re-run the one file until it passes, then its whole project
  (`pnpm exec vitest run --project <project>`) for whatever else the change reached.
- Green reached by editing the test is not green. An assertion changes only when the
  expectation itself was wrong, and the pull request says so.

## Refactor with the tests on

With the tests green, restructure (rename, extract into core, remove duplication)
without changing behavior, re-running the tests after each step. A refactor that needs
an assertion changed has changed behavior; that is a new red, not a refactor.

Then run `pnpm typecheck`, which the runs above never did, and widen to the gate as
`CLAUDE.md`'s "Commands" lays out. The coverage floors are judged only by the full gate.

## Fixing a bug

The regression test comes before the fix, and it reproduces the bug through the surface
the caller hit, not through a helper the bug happened to pass through.

1. Write the test the way the caller met the bug: the exported core function called with
   the inputs that went wrong, the helper called with the value that broke it, the
   script's entry called with the arguments that failed. Name it after the behavior, not
   the report.
2. Prove it fails with the bug's own symptom (the wrong value, the wrong exit code, the
   wrong error `code`), not with any error at all.
3. Then green and refactor as above. The regression test stays.

A bug that shows only in the running page has no test surface yet. Observe it with
`running-the-app`, find the decision that was wrong, move it into a helper or into core,
and start the regression test there.

## Commit

The test and the implementation land in one commit, with any document the change owes. A
code-only commit puts untested behavior on the branch, and a test added in a later
commit can no longer be shown to have failed against it. `smart-commit` groups them.

## Anti-patterns

- Implementation first, then a test that asserts what the code returned.
- Weakening or deleting an assertion to reach green, or pasting in whatever value the
  code produced as the expected one.
- `it.skip`, `it.todo`, or `describe.skip` for a case that does not pass yet:
  `CLAUDE.md` counts a skipped test as a weakened gate.
- Asserting a mock's call count or a private helper instead of the behavior it serves.
- Skipping the failing run because the failure was obvious.

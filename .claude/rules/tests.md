---
paths:
  - "tests/**/*.ts"
  - "vitest.config.ts"
---

# Tests

## Placement

- Every test is `tests/<module>.test.ts`, never next to its source. `tests/fixtures/`
  holds data only; nothing under it is linted, formatted, type-checked, spell-checked,
  or collected, which is what lets a fixture be malformed on purpose.
- `vitest.config.ts` has two projects. A test starts in `unit` (imports `src/**`, no
  filesystem, subprocess, or git; 5-second budget). When it gains any of those, add its
  path to the `automationTests` list. An I/O test left in `unit` times out loudly; a
  pure test listed in `automationTests` passes quietly on a budget it does not need.
- Coverage has three independent floors: `src/**`, `scripts/**`, and a higher one for
  `scripts/lib/guard/**` (the secret-detection engine). `coverage.include` lists both
  trees, so a new file counts at 0% until tested: write its test in the same pull
  request. Read the numbers from the config.
- **Coverage stops at the process boundary.** Code that runs only inside a spawned child
  reports 0%. Keep the child's entry thin and put the logic in a module the test also
  calls in-process.
- When a floor fails, cover the missing branch. Raising a floor follows measured
  coverage; lowering one is ruled out in `CLAUDE.md`.

## Writing a test

- Test through `src/index.ts`'s exports, never `src/internal/**`. A command is tested
  through its entry: `argv` in; exit code, stdout, and stderr out.
- An expected value comes from outside the code under test (a literal, a worked example,
  the spec), never recomputed the way the implementation computes it.
- Assert an error's class and `code`, never its message. Check cleanup on the failure
  path too.
- Sweep the edges: `0`, `1`, negative, fractional where an integer is required,
  `Number.MAX_SAFE_INTEGER`; an absent optional property versus an explicit `undefined`;
  unicode and emoji; single and duplicate elements; cancellation.
- Mock only at boundaries (network, filesystem, clock, child process, randomness);
  prefer an in-memory fake to a mock; never mock the module under test.
- No real sleeps: `vi.useFakeTimers()` with `await vi.advanceTimersByTimeAsync(ms)`.
  `tests/timeout.test.ts` is the model for an abortable API.
- Filesystem tests use a fresh `mkdtempSync` directory removed in `afterEach`.
  Environment and globals go through `vi.stubEnv` and `vi.stubGlobal`; the config resets
  those and mocks between tests, so clean up only what the runner cannot know about (a
  timer, a listener, a temp directory, a child process).
- A test that spawns `git` clears inherited `GIT_*` variables with `isolatedGitEnv` from
  `scripts/lib/git-env.mjs`: under the pre-commit hook, an inherited `GIT_DIR` outranks
  `cwd`.

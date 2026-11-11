---
paths:
  - "tests/**/*.ts"
  - "packages/core/test/**/*.ts"
  - "apps/web/test/**/*.ts"
  - "vitest.config.ts"
---

# Tests

## Placement

- A test lives beside the layer it covers, never next to its source, as
  `<module>.test.ts`: `packages/core/test/` (importing core through `../src/index.js`),
  `apps/web/test/` (pure helpers only; the web entry and scenes run in a real browser),
  and `tests/` for repository automation, tool configs, and workflows.
- `tests/fixtures/` holds data only; nothing under it is linted, formatted,
  type-checked, spell-checked, or collected, which is what lets a fixture be malformed
  on purpose.
- `vitest.config.ts` has four projects. `core` and `web` follow from the directory and
  carry the short unit budget. A file under `tests/` starts in `unit` (pure functions,
  no filesystem, subprocess, or git). When it gains any of those, add its path to the
  `automationTests` list. An I/O test left in `unit` times out loudly; a pure test
  listed in `automationTests` passes quietly on a budget it does not need.
- Each layer has its own coverage floor: `packages/core/src/**` (the highest),
  `apps/web/src/**`, `scripts/**`, and a higher one for `scripts/lib/guard/**` (the
  secret-detection engine). `coverage.include` lists them all, so a new file counts at
  0% until tested: write its test in the same pull request. Read the numbers from the
  config.
- **Coverage stops at the process boundary.** Code that runs only inside a spawned child
  reports 0%. Keep the child's entry thin and put the logic in a module the test also
  calls in-process.
- When a floor fails, cover the missing branch. Raising a floor follows measured
  coverage; lowering one is ruled out in `CLAUDE.md`.

## Writing a test

- Test through a module's exports (core's through `packages/core/src/index.ts`), never
  its private helpers. A command is tested through its exported entry, such as `clean()`
  in `scripts/clean.mjs`: arguments in; exit code, stdout, and stderr out.
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
- Filesystem tests use a fresh `mkdtempSync` directory removed in `afterEach`.
  Environment and globals go through `vi.stubEnv` and `vi.stubGlobal`; the config resets
  those and mocks between tests, so clean up only what the runner cannot know about (a
  timer, a listener, a temp directory, a child process).
- A test that spawns `git` clears inherited `GIT_*` variables with `isolatedGitEnv` from
  `scripts/lib/git-env.mjs`: under the pre-commit hook, an inherited `GIT_DIR` outranks
  `cwd`.

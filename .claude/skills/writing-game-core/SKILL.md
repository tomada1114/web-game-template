---
name: writing-game-core
description: >
  Use when writing or reviewing anything under packages/core/src/** or
  packages/core/test/**: the xoshiro128** PRNG and splitmix32 seeding, seedFrom
  (FNV-1a), dailySeed, createGame, applyMove, isOver, score, replay, the replay record
  and RULES_VERSION, ERR_INVALID_MOVE or ERR_RULES_VERSION, a changed value in
  golden.test.ts, a property test, a lint error in core for Math.random, Date, Math.sin,
  Math.pow, ** or localeCompare, a float or class in game state, or the sample ruleset
  in packages/core/src/sample/.
---

# Writing Game Core

**Owns:** the deterministic rules in `packages/core` — the PRNG and seeds, the exported
API and state shape, replay and `RULES_VERSION`, why the determinism guard exists, the
golden and property tests, and the sample ruleset. **Does not own:** rendering, input,
and where the clock or randomness is read (`building-scenes`); storage and portal calls
(`integrating-portals`); editing the lint block itself (`.claude/rules/gates.md`); the
PR's `Rules version:` line (`releasing-builds`); the shape of an error class and
type-system judgment (`.claude/rules/typescript.md`); where a test file goes and its
coverage floor (`.claude/rules/tests.md`).

The constraint every rule here follows: the same seed and the same list of moves give
the same state and score on every JavaScript engine — V8, JavaScriptCore, SpiderMonkey.
A server can then replay a run to verify it, and every player gets the same daily board.
Anything that reads time, randomness, the device, or the network lives in `apps/web` and
enters core as a plain value.

## PRNG and seeds

- `packages/core/src/prng.ts` implements xoshiro128** (Blackman & Vigna,
  https://prng.di.unimi.it/, checked 2026-11-05) on four 32-bit words, seeded through
  splitmix32 from one 32-bit seed. It is the only generator in the repository; a second
  one, or a "quick" helper beside it, splits the sequence a replay depends on.
- Integer operations only: `Math.imul`, `<<`, `>>>`, `>>`, `|`, `&`, `^`, `+`, `-`,
  `|0`. A value leaves the generator unsigned (`>>> 0`).
- `nextU32()` is the primitive. `nextInt(maxExclusive)` uses rejection sampling — never
  `nextU32() % n` (modulo bias) and never a division into a float.
- A rule that draws randomness after `createGame` keeps the generator's four words in
  `State` and returns the advanced words in the new state. A module-level generator
  makes `applyMove` impure and breaks replay.
- The order of draws is part of the rules. Drawing one extra number, or the same numbers
  in a different order, shifts every later value and moves the golden values.
- `packages/core/src/seed.ts`: `seedFrom(text)` is FNV-1a 32-bit over UTF-16 code units
  (`charCodeAt`, not UTF-8 bytes, not code points), finished with `>>> 0`.
  `seedFrom("")` is the FNV-1a offset basis, 2166136261.
- `dailySeed(day, salt)` is `seedFrom(salt + ":" + day)`. `day` is a `YYYY-MM-DD` string
  that `apps/web` computes in UTC; `salt` is the game's slug, also passed in by
  `apps/web`. Core never computes a date. A Practice seed is chosen in `apps/web` and
  arrives as an integer.

## API and state

- `packages/core/src/index.ts` is the only module `apps/web` imports. It exports
  `createGame(seed, config)`, `applyMove(state, move)`, `isOver(state)`, `score(state)`,
  `replay(record)`, `seedFrom`, `dailySeed`, `RULES_VERSION`, and the error classes.
- `applyMove` is pure: it returns a new object and never mutates its input. It throws
  `InvalidMoveError` with code `ERR_INVALID_MOVE` for an out-of-range cell or a finished
  game. The throw marks a caller bug; scenes check `isOver` and the cell range first so
  an invalid input does nothing visible. **BACKGROUND:** `building-scenes`.
- `State` is JSON data only — integers, arrays of integers, strings. No classes, `Map`,
  `Set`, `Date`, floats, or `undefined` fields. A run is checked by comparing state
  after a round trip through JSON, and a class instance, a `Map`, a `Date`, or an
  `undefined` field does not survive that trip unchanged. Integer state also keeps every
  operation exact, so nothing tempts a rule toward the approximated `Math` functions.
- `config` holds the ruleset's parameters as plain JSON and travels in the replay
  record, so a run is reproduced with the parameters it was played under.
- `isOver` and `score` are functions of `State` alone.
- A new error type or code, and type-level choices, follow the conventions in
  `.claude/rules/typescript.md`.

## Replay and rules version

- The replay record is `{ v, seed, config, moves }`, where `v` is the `RULES_VERSION`
  (`packages/core/src/rules-version.ts`) the run was played under.
- `replay(record)` throws with code `ERR_RULES_VERSION` when `record.v` differs from
  `RULES_VERSION`; otherwise it folds `applyMove` over `moves` from
  `createGame(seed, config)` and returns `{ state, score }`. A record from another
  version is rejected, never reinterpreted.
- Once a release has shipped, any change that alters a golden value bumps
  `RULES_VERSION`, and the new golden literals land in the same change. That covers
  board generation, the order of PRNG draws, move semantics, scoring, and config
  defaults. A refactor that leaves every golden value as it was does not bump.
- Before the first release there are no shipped runs to protect: a game that replaces
  the sample deletes the sample goldens, writes its own, and keeps `RULES_VERSION = 1`.
- The golden tests decide whether results changed. Run them before touching a literal; a
  literal edited to make a red test pass without a bump hides exactly the change the
  version exists to announce.
- The PR states the outcome. **REQUIRED:** `releasing-builds`.

## Enforcement

Enforced by: `eslint.config.mjs` block for `packages/core/src/**`
(`no-restricted-globals`, `no-restricted-properties`, `no-restricted-syntax`), and
`tests/determinism-lint.test.ts`, which lints a fixture of forbidden calls with the real
config and expects, per line, one message from those three rules (messages from other
rules are ignored). Enforced by: `packages/core/tsconfig.json` `compilerOptions.types`
(no DOM, no Node globals). Enforced by: `vitest.config.ts` `coverage.thresholds` for
`packages/core/src/**`.

Why the list looks the way it does:

- ECMA-262 §21.3.2 lets engines approximate `Math.sin`, `cos`, `tan`, `exp`, `log`,
  `pow`, `hypot` and the rest of that family
  (https://tc39.es/ecma262/multipage/numbers-and-dates.html, checked 2026-11-05). One
  differing last bit flips a comparison and the run diverges on that engine only. `**`
  and `**=` are banned with `Math.pow`; lint cannot tell a number operand from a bigint
  one, so bigint exponentiation is banned too.
- `Math.random`, `Date`, `performance`, `crypto`, the timers and `queueMicrotask` give a
  different value or order on every run; `WeakRef`, `FinalizationRegistry`,
  `SharedArrayBuffer` and `Atomics` depend on the garbage collector or on threads;
  `Intl`, `localeCompare` and every `toLocale*` method depend on the locale; `window`,
  `document` and `globalThis` reach the device. Each one becomes a parameter that
  `apps/web` supplies. The locale methods are banned through `no-restricted-syntax` on
  the member expression (dot or computed access), since they are methods, not globals.
- `Math` is an allowlist: only `floor`, `abs`, `min`, `max`, `imul`, `sqrt`, `trunc`,
  `sign`, `clz32` and `round` may be read, and `Math` itself may not be used as a value
  (`const M = Math`, `Reflect.get(Math, …)`). Compare strings with `<` on code units,
  not `localeCompare`.

When the guard blocks something a rule needs, write it in integers — fixed-point
arithmetic or a lookup table — rather than disabling the rule. An `eslint-disable` in
core is a weakened gate (`CLAUDE.md`); a change to the block itself follows
`.claude/rules/gates.md`, and `tests/determinism-lint.test.ts` changes with it.

## Golden and property tests

- `packages/core/test/golden.test.ts` holds literal expected values: fixed seeds give an
  exact start board, a fixed replay gives an exact state and score, and
  `dailySeed("2026-11-05", "golden")` gives a fixed number. The salt is the literal
  `"golden"`, never the game's slug, so renaming the game never moves a golden value.
- Produce a golden value once from the implementation and freeze it as a literal. Never
  compute the expected value with the code under test — that test can only pass.
- A changed golden value fails CI on purpose. After the first release, updating it is
  the same change as the `RULES_VERSION` bump.
- `packages/core/test/property.test.ts` loops over a fixed range of seeds, drawing moves
  from core's own PRNG, and checks that `replay(record)` equals folding `applyMove` and
  that `applyMove` never mutates its input. Name each case after its seed so a failure
  reproduces from the test name. No property-testing library is needed.
- Golden tests run on Node; the lint guard stands in for the other engines. A golden
  value that ever differs between Node and a browser means the guard has a hole — report
  it rather than special-casing the engine.
- File location, floors, and test-body conventions: the conventions in
  `.claude/rules/tests.md`.

## The sample ruleset

`packages/core/src/sample/` holds the sample game. It shows the pattern and is replaced
by each game; its rules are not a product decision.

- A 5×5 board of 4 tile kinds (0–3), cells indexed 0–24 row by row. `State` is
  `{ seed, cells: int[25], movesUsed, limit }`; a move is `{ cell }`. Config is
  `SAMPLE_CONFIG = { size: 5, kinds: 4, moveLimit: 20, scrambleMin: 6, scrambleMax: 10 }`.
- A move advances the chosen cell and its orthogonal neighbours by one kind, mod 4: cell
  0 changes 0, 1, 5; cell 12 changes 12, 7, 11, 13, 17; cell 24 changes 24, 23, 19.
- The board is solved when all 25 cells share one kind. The move limit is 20. Score is
  `moveLimit + 1 - movesUsed` (1–20) when solved, else 0, shown as `<score>/20`.
- The start board is built from reverse moves: from a uniform board of kind 0, draw
  `n = scrambleMin + nextInt(scrambleMax - scrambleMin + 1)`, then `n` cells with
  `nextInt(size*size)`, and apply each as a reverse move (kind minus one, mod 4); while
  the result is uniform, draw one more reverse move, where `k` counts these retry draws
  (in practice `k` is 0). If `n + k` would exceed 20, the retry stops and the whole
  scramble is redrawn. Pressing the drawn cells forward solves it, so a solution within
  `n + k ≤ 20` moves always exists: the board is never uniform and always solvable
  within the limit.

Replacing the sample: **REQUIRED:** `starting-an-app`.

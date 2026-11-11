---
paths:
  - "src/**/*.ts"
---

# TypeScript in `src/`

Lint and the compiler report most mistakes themselves; this file holds the judgment they
cannot.

## Types

- Take `unknown` at an untyped boundary (parsed JSON, a caught error, a callback) and
  narrow it. Prefer `satisfies` to `as` on a literal; narrow on runtime shape with a
  type guard, and keep any surviving assertion local and non-exported.
- `noUncheckedIndexedAccess`: treat the `undefined` from `arr[i]` or `record[key]` as a
  real branch instead of asserting it away.
- `exactOptionalPropertyTypes`: a public `XOptions` interface declares its properties
  `readonly` and `?:`. An internal argument whose omission would be a bug takes a
  required `T | undefined`, so a caller cannot drop it by accident.
- Annotate the return type of every non-generic export. On a generic export, annotate
  only when the annotation is provably no wider than inference: a hand-written return
  type is the usual way a generic gets widened.
- Model mutually exclusive shapes as a discriminated union on a literal field and give
  each member its own `case`. Do not add a `default` to quiet
  `switch-exhaustiveness-check`: the config reads a `default` as the deliberate answer
  to every future member.
- Keep a constant next to the code that uses it; no shared `constants.ts`.

## Errors

- **`code` is the contract; `message` is not.** Callers, tests, and catch clauses branch
  on `code` or `instanceof`, never on message text.
- An error class subclasses `Error`, sets `this.name`, and declares `readonly code` as a
  string literal (`"ERR_INVALID_INPUT" as const`) so a consumer can narrow on it.
  `src/errors.ts` is the model.
- Codes are `ERR_` plus `SCREAMING_SNAKE_CASE`, named for the failure, not the function
  (`ERR_TIMEOUT`, not `ERR_WITH_TIMEOUT_FAILED`).
- Carry `readonly` fields that describe what was rejected (a limit, an allowed set, the
  dotted path from the public signature such as `options.maxLength`), never the rejected
  value itself: it can hold sensitive input.
- When forwarding an abort, pass the same error instance to `controller.abort()` and to
  `reject()`, as `withTimeout` in `src/timeout.ts` does.
- Adding, renaming, or removing a `code` on a reachable error is a contract change; say
  so in the pull request's release line.

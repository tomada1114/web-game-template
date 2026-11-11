---
paths:
  - "packages/core/src/**/*.ts"
  - "apps/web/src/**/*.ts"
  - "**/tsconfig*.json"
---

# TypeScript in the workspace packages

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
- Annotate the return type of every non-generic export from
  `packages/core/src/index.ts`. On a generic export, annotate only when the annotation
  is provably no wider than inference: a hand-written return type is the usual way a
  generic gets widened.
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
- Codes are `ERR_` plus `SCREAMING_SNAKE_CASE`, named for the failure, not the function
  (`ERR_TIMEOUT`, not `ERR_WITH_TIMEOUT_FAILED`).
- Carry `readonly` fields that describe what was rejected (a limit, an allowed set, the
  dotted path from the public signature such as `options.maxLength`), never the rejected
  value itself: it can hold sensitive input.
- When forwarding an abort, build the error once and pass that instance to both
  `controller.abort()` and `reject()`.
- Adding, renaming, or removing a `code` on a reachable error is a contract change; say
  so in the pull request's release line.

## One program per runtime

`pnpm typecheck` is `tsc -b` on the root `tsconfig.json`, which references one program
per layer; each extends `tsconfig.base.json` and states only what its runtime differs
in.

- **Core sees neither DOM nor Node** (`lib: ["ES2023"]`, `types: []`), and ESLint
  rejects the same globals and every `node:` import in `packages/core/src/**`. Read a
  platform value in `apps/web` and pass it in.
- Core uses `NodeNext`, so a relative import carries its `.js` suffix
  (`rules-version.js` for `rules-version.ts`); `apps/web` uses `Bundler`.
- `apps/web` imports core by package name; the `exports` map points at
  `packages/core/src/index.ts` and Vite bundles that source, so core has no build step.
- Each test directory is a program of its own: importing `vitest` pulls in Node's types,
  which must not leak into core's source program.
- A referenced program is `composite` with `emitDeclarationOnly` and writes under the
  gitignored `.tsbuild/`, never `dist/`.
- `apps/web/vite.config.ts` runs in Node and is checked by the root program.

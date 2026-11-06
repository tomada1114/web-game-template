---
name: writing-typescript
description: >
  Use when writing or reviewing a module under packages/core/src/** or apps/web/src/**:
  narrowing unknown instead of any, `satisfies` vs `as`, a type guard, interface vs
  type, an exhaustive switch over a union, `import type` under verbatimModuleSyntax, why
  `enum` and DOM or Node globals are rejected in packages/core, a tsc -b or
  project-reference error, annotating a return or generic boundary, hitting
  noUncheckedIndexedAccess or exactOptionalPropertyTypes, placing a new constant, or
  fixing a logic bug in an existing workspace function.
---

# Writing TypeScript

**Owns:** type-system judgment, naming, and constant placement inside a
`packages/core/src/**` or `apps/web/src/**` module, and the compiler settings of each
workspace program. **Does not own:** the shape of an error class (`designing-errors`);
what may be exported from `packages/core/src/index.ts` (`writing-game-core` § API and
state); the `.mjs` files under `scripts/` (`writing-repo-scripts`).

## Naming and constants

- An error `code` string is not a naming decision made here — **REQUIRED:**
  `designing-errors` owns the `ERR_*` vocabulary for workspace source and `scripts/`.
- Keep a constant next to the code that uses it. Do not create a shared `constants.ts`
  grab-bag that forces unrelated modules to import each other.

## Boundary types: unknown, any, and assertions

- Take `unknown` at an untyped boundary (parsed JSON, a caught error, a third-party
  callback) and narrow it before use; `any` disables checking for everything downstream
  of it, not just at the boundary.
- Prefer `satisfies` to `as` on a typed literal: `satisfies` keeps excess-property and
  missing-property checking, `as` silences both.
- A type assertion (`as T`) changes only the compile-time type — it provides zero
  runtime safety. Reach for a type guard (`value is T`) when narrowing based on runtime
  shape, and keep any assertion that survives review local and non-exported.

## Imports

- Mark a type-only named import inline (`import { value, type X } from "./x"`), the form
  `@typescript-eslint/consistent-type-imports` autofixes to, per `eslint.config.mjs`'s
  `fixStyle` setting for that rule. A separate `import type { X } from "./x"` statement
  also satisfies the rule and is fine when every named import in the statement is
  type-only.
- Never hand-fix an import differently from what `pnpm fix` produces.

## interface vs type

- Prefer `interface X extends Y` to `type X = Y & Z` when composing object types — the
  `&` operator is markedly slower to type-check, and the gap widens with the number of
  intersected members.
- `@typescript-eslint/consistent-type-definitions` already prefers `interface` for
  object shapes; this is the reason behind that rule, not an extra rule of its own.

## Strictness flags to work with, not around

- Indexed access (`arr[i]`, `record[key]`) yields `T | undefined` here —
  `noUncheckedIndexedAccess` is on. Treat the `undefined` branch as real rather than
  asserting it away.
- `exactOptionalPropertyTypes` makes an absent property and an explicit `undefined`
  distinct types. An exported `XOptions` interface declares its properties `readonly`
  and `?:`; an internal argument whose omission would be a bug takes a required
  `T | undefined` instead, so a caller cannot drop it by accident.
- `noPropertyAccessFromIndexSignature` forbids dot access on an index signature, while
  typed-lint's `dot-notation` pushes the other way for a literal key. A literal
  `as const` object escapes the conflict because its keys are literal, not an index
  signature; a widened `Record<string, T>` does not. `scripts/lib/json.mjs`'s
  `readKey`/`readString` are the resolution used for parsed-JSON reads — see
  `writing-repo-scripts` for that rule itself.
- Do not introduce `enum`. `tsconfig.json`'s `erasableSyntaxOnly` forbids it.

## Function boundaries and generics

- Annotate the return type of every non-generic export from
  `packages/core/src/index.ts`.
- On a generic export, annotate the return type only if the annotation is provably no
  wider than what inference would produce — a hand-written annotation is the standard
  way to accidentally widen a generic that should stay preserved.
- Keep exported generics narrow: accept the widest reasonable input, return the
  narrowest true output — a function wrapping an operation returns that operation's own
  resolved type instead of widening it to something looser.
- Let inference do the work inside a function body; reserve explicit annotations for
  boundaries (parameters, exported return types), not every local binding.

## Discriminated unions and exhaustiveness

- Prefer a discriminated union with a literal field (`code`, `kind`) over a bag of
  optional flags when a value has mutually exclusive shapes, and narrow it by branching
  on that field rather than checking several optional properties together.
- Handle a union exhaustively by giving each member its own `case`. Do not add a
  `default` branch to make the check pass:
  `@typescript-eslint/switch-exhaustiveness-check` in `eslint.config.mjs` sets
  `considerDefaultExhaustiveForUnions`, so a `default` is read as the deliberate answer
  to a new union member, not a placeholder — adding one to silence the rule is what
  disables the protection it exists to give.

## One program per runtime

`pnpm typecheck` is `tsc -b` on the root `tsconfig.json`, which references one program
per layer. Each extends `tsconfig.base.json` for the shared strictness and states only
what its runtime differs in:

| Program                            | Runtime                             | Module resolution                                                  |
| ---------------------------------- | ----------------------------------- | ------------------------------------------------------------------ |
| `packages/core/tsconfig.json`      | `lib: ["ES2023"]`, no `types`       | `NodeNext`, `.js` suffix on relative imports                       |
| `apps/web/tsconfig.json`           | `ES2023` + `DOM`, `vite/client`     | `Bundler`                                                          |
| `packages/core/test/tsconfig.json` | `ES2023`, Node (via Vitest)         | `NodeNext`                                                         |
| `apps/web/test/tsconfig.json`      | `ES2023` + `DOM`, Node (via Vitest) | `Bundler`                                                          |
| `tsconfig.json` (root)             | Node                                | `NodeNext`; scripts, tests, configs, and `apps/web/vite.config.ts` |

- Core sees neither DOM nor Node: `types: []` keeps `@types/node` out, and the `lib`
  list keeps `document` out, so either global fails `pnpm typecheck` with "Cannot find
  name". `eslint.config.mjs` rejects the same globals and every `node:` import in
  `packages/core/src/**`, naming the boundary in its message. Read a value from the
  platform in `apps/web` and pass it in instead.
- Core's tests are a program of their own because importing `vitest` pulls Node's types
  in through Vite's declarations. Sharing core's program, that would let a `process`
  reference type-check in core's source.
- Core keeps `NodeNext`, which requires an explicit extension on every relative import
  (`rules-version.js` to import `rules-version.ts`), so core never leans on a resolution
  only a bundler performs. Vite resolves the `.js` suffix to the `.ts` file for an
  importer. `apps/web` uses `Bundler`, because Vite, not Node, resolves its imports.
- `apps/web` imports core by its package name, whose `exports` map points at
  `packages/core/src/index.ts`; Vite bundles that source directly, so core has no build
  step of its own.
- A program another program references must emit, so each referenced program is
  `composite` with `emitDeclarationOnly`, writing declarations and its build info under
  the gitignored `.tsbuild/` — never `dist/`, which is the game's build output. Nothing
  reads `.tsbuild/` except `tsc -b` itself; `pnpm clean` removes it.
- A Vite config runs in Node, so `apps/web/vite.config.ts` is checked by the root
  program, not by the browser-only `apps/web/tsconfig.json`.

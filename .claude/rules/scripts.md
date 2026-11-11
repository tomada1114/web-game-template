---
paths:
  - "scripts/**/*.mjs"
  - ".claude/skills/**/*.mjs"
---

# Repository automation scripts

- **`.mjs`, builtins only.** These scripts run on plain Node before `pnpm install`, so
  they import only `node:*` and `scripts/lib/`. A script that needs an installed tool
  resolves it at run time with `resolveDependencyBin` from `scripts/lib/node-tools.mjs`.
  Import `process` and `console` from their `node:` modules.
- They are type-checked like `.ts` (`allowJs`/`checkJs`): declare boundary types in
  JSDoc, receive `JSON.parse` output as `unknown`, and read it through `readKey` and
  `readString` in `scripts/lib/json.mjs`. Those helpers exist because
  `noPropertyAccessFromIndexSignature` and the typed `dot-notation` rule disagree about
  literal-key access on a `Record`.
- A file that is both importable and runnable guards its CLI half with
  `isMain(import.meta.url)` from `scripts/lib/is-main.mjs`, so a test import never
  triggers a run.
- **Spawning `git`.** Git exports `GIT_DIR` (and sometimes `GIT_INDEX_FILE`) to every
  hook, and an inherited `GIT_DIR` outranks both `cwd` and `-C`: a `git` spawned with
  only a `cwd` writes to the outer repository. Pass `env: isolatedGitEnv()` from
  `scripts/lib/git-env.mjs`. The one exception is `scripts/check-staged.mjs`, which is
  the pre-commit layer and must read the index the hook gave it.
- **Failures are read by an agent.** Print to stderr: an `ERR_<STAGE>_*` code, what
  failed, the path involved, expected versus actual, and the next safe command; never a
  secret or an absolute home path. Reuse an existing stage prefix when the failure
  belongs to a check that has one. Example:

  ```
  ERR_DEPENDENCY_MISSING: eslint is not installed.
  Expected: node_modules/eslint/package.json
  Next: run `pnpm install --frozen-lockfile`.
  ```

- A script bundled inside a skill follows the same contract but sits outside
  `coverage.include`. Keep it a thin dispatcher and put branching logic under
  `scripts/`, where the `scripts/**` coverage floor applies from the moment a file
  exists.

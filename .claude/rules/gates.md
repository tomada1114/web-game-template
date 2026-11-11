---
paths:
  - ".github/workflows/*.yml"
  - "lefthook.yml"
  - "eslint.config.mjs"
  - "tsconfig*.json"
  - "vitest.config.ts"
  - ".prettierrc.json"
  - "typos.toml"
---

# Files that enforce rather than implement

Whether a gate may be weakened at all is settled in `CLAUDE.md` (it may not, to make a
run pass). This file is how a legitimate change to one is made.

- **A gate calls a package script; it never defines a check of its own.** Adding a check
  means adding a script to `package.json` and calling it from CI and, when it suits a
  staged-file run, from `lefthook.yml`.
- **A gate change is stated, not slipped in.** The pull request says which rule, option,
  step, or threshold moved, why, and what now passes or newly fails. It never rides
  inside the pull request whose red run it would turn green; a human decides.

## CI workflows

`tests/workflows.test.ts` holds the mechanical half (SHA-pinned actions with a tag
comment, per-job timeouts, top-level `permissions: contents: read`, no persisted
credentials, concurrency groups). The judgment it cannot encode:

- A new workflow file is warranted only by a new trigger shape or a separate permission
  footprint; otherwise add a job to `ci.yml`.
- `pr-label.yml` (a label) and `release.yml` (the GitHub Release, on a pushed tag only)
  are deliberately the only workflows with write permission. Another write grant is a
  security change and is reviewed as one.
- Removing or narrowing a pin, a `permissions` block, or a timeout needs its reason in
  the pull request body.

## The pre-commit hook

- The hook is deliberately narrow: formatting, lint and typecheck on staged files,
  related tests, and the staged-secret check (`scripts/check-staged.mjs`, whose rule
  engine is `scripts/lib/guard/`). It does not try to stop a deleted workflow or a
  lowered threshold: those are judgment calls for a reviewer. A hook that blocks
  intended work teaches `--no-verify`, which disables the secret check along with
  everything else. A new job must never fire on an ordinary commit; try it on one.
- Order is load-bearing: `format` runs alone first so later jobs see formatted content,
  and `check:staged` must read the re-staged blobs, not the pre-format tree.

## Tool configs

Each config holds its own current values; read the file instead of trusting a number
quoted elsewhere, and do not quote one into guidance.

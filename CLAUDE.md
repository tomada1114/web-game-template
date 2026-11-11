# Project Guide

A template for a TypeScript browser game, worked on with Claude Code; nothing is
published to npm (publishing is a release tag or a portal upload). Development and CI
run on Node >= 24, pnpm 11 via Corepack; never relax `devEngines.runtime`'s
`onFail: error`.

Design decisions and procedures live in the skills under `.claude/skills/` (load the
matching one first), requirements in `docs/product/requirements.md`, file conventions in
`.claude/rules/`, and machine-enforceable rules in the configs, which the gate runs.

## Product

TODO: What this game is, in one paragraph.  
TODO: Who it is for, and the core interaction.  
TODO: Non-goals, copied verbatim from docs/product/requirements.md.  
TODO: Where decisions live: docs/product/requirements.md and the skills.

## Commands

```sh
pnpm hooks:install # once per clone: lefthook's git hooks, which carry the secret gate
pnpm check:quick   # format check, lint, typecheck, tests — the everyday gate
pnpm check         # the full gate: pnpm check:source, pnpm budget, pnpm package:crazygames
pnpm check:source  # pnpm format:check, pnpm lint, pnpm typecheck, pnpm test:coverage, pnpm build
pnpm fix           # ESLint autofix, then Prettier (pnpm format alone); never a proof
pnpm test          # every Vitest project once; pnpm test:related runs only the hook's subset
pnpm budget        # fail when apps/web/dist is over the bundle budget (pnpm budget <dir>)
pnpm package:crazygames # the portal build, then .package/<slug>-<version>-crazygames.zip
pnpm dev           # Vite's dev server for apps/web; runs until stopped
pnpm e2e:browsers  # once per machine: install Playwright's Chromium
pnpm test:e2e      # rebuild apps/web/dist, then the Chromium boot smoke (E2E_PORT, default 4173)
pnpm check:staged  # the pre-commit secret check by hand; pnpm clean removes build output
pnpm repo:labels   # create/update GitHub labels from .github/labels.yml
```

<!-- template-only:start -->

```sh
pnpm bootstrap:e2e   # run the bootstrap end to end on a copy
pnpm bootstrap:check # the same, then install and run the full gate in the generated repository
```

This checkout is the template itself. The bootstrap flow removes itself, this block, and
`.claude/rules/bootstrap.md` from a generated repository.

<!-- template-only:end -->

Run the narrowest check that can fail, then the gate: `pnpm exec vitest run <path>` or
`--project core` (or `web`, `unit`, `automation`), such as
`tests/determinism-lint.test.ts` then `pnpm lint` for the core determinism block, or
`apps/web/test/theme/contrast-pairs.test.ts` for `apps/web/src/theme/tokens.ts` or
`docs/design/contrast-pairs.json`; `pnpm typecheck` then `pnpm test:e2e` for
`apps/web/src/main.ts`, `apps/web/src/scenes/`, `apps/web/index.html` or `tests/e2e/`;
`pnpm build && pnpm budget` then `pnpm package:crazygames` for `apps/web/src/platform/`
or the build config; `pnpm install` then `pnpm check` after a manifest; `pnpm fix` after
Markdown; `pnpm test:watch` reruns tests until stopped. The hooks and CI run these same
checks; CI adds typos, dependency review and gitleaks.

## Architecture

```
packages/core/
├── src/index.ts   # the only module apps/web imports
└── test/          # core's unit tests
apps/web/
├── index.html     # the page Vite builds into apps/web/dist
├── src/main.ts    # the browser entry
├── vite.config.ts # base "./": every built asset URL is relative
└── test/          # unit tests of pure helpers
scripts/           # repository automation (.mjs), never shipped
tests/             # repository-level tests
```

- `packages/core` holds the deterministic rules and imports nothing: no dependencies, no
  DOM, no Node. It never imports from `apps/*`.
- `apps/web` depends on core by its workspace name and reaches it only through
  `packages/core/src/index.ts`.
- Anything that reads time, randomness, the device, or the network lives in `apps/web`
  and enters core as a plain value.

## Security and human approval

- **Inside a task a human explicitly authorized (an explicit `shipping-issues` request
  is one), commits, branch pushes, and pull requests need no separate request.** Merging
  needs an explicit request that names it, as a request to ship an issue does; a request
  for a pull request stops there. Outside such a task, each still needs a human.
- **A release tag, a portal upload, a new dependency, the branch ruleset, and the
  repository's security settings stay the owner's.** Propose concretely, then ask.
- Nothing here mechanically blocks `--no-verify`, `LEFTHOOK=0`, a force-push, a release
  tag, or a portal upload; this rule does. Any bypass is ruled out, not one spelling.
- Never read or write `.env*` (the `.example`, `.sample` and `.template` variants are
  fine) or anything under `secrets/`, and never write a credential into a tracked file.
  The pre-commit hook inspects only what is staged, so a shell read is not caught.
- Every pull request states `Release: none` or `Release: needed — <reason>`, from
  `.github/PULL_REQUEST_TEMPLATE.md`.
- `pnpm-lock.yaml` is generated by `pnpm install`, never hand-edited. Before adding,
  bumping, or removing a package, read `.claude/rules/dependencies.md`.
- **Never weaken a gate to make a run pass**: no lowered coverage threshold, no file
  added to `coverage.exclude` to move a number, no deleted security workflow, no removed
  `--frozen-lockfile`, no removed or relaxed ESLint rule or `pnpm-workspace.yaml`
  supply-chain setting, no `@ts-ignore`, no blanket `eslint-disable`, no skipped or
  deleted test. If a gate is wrong, say so and let a human decide. It lives here because
  an agent that sees only "make CI green" loads nothing else.

## Conventions

- All committed code, comments, configuration, and documentation are in English.
- A comment carries only what the code cannot: a non-obvious why, a trap the next edit
  would spring, an external constraint. Default to none. TSDoc on the public surface is
  a contract and stays.
- Do what was asked; nothing more. Prefer editing an existing file to creating one. Note
  improvements outside the current scope instead of making them.
- Documentation impact is decided by what a user can observe (a signature, a default, a
  runtime behavior, an error `code`, a setup step). When one moved, `README.md` and the
  affected `docs/` page change in the same pull request; otherwise say none is needed.
- Sub-agent tiers (`.claude/agents/`) are named by role, never by model or effort. Hand
  a step to one with `subagent_type`, never a bare `model`, whose effort is the
  session's.

# Project Guide

This file is the source of truth for every agent working in this repository.
Tool-specific files (`CLAUDE.md` and anything like it) add only what is specific to that
tool; they never restate what is here.

Machine-enforceable rules are not written down here either. `eslint.config.mjs`,
`tsconfig.json`, `.prettierrc.json`, `vitest.config.ts` and `pnpm-workspace.yaml` are
the source of truth for those, and running the gate is how you learn them.

Neither are the conventions of a particular kind of work. Those live in the skills under
`.agents/skills/`, one per kind of change, and load when the work you are doing calls
for them — see [Skills](#skills) for the index. What is left in this file is what has to
be true _before_ you know which task you are on: what this repository is, how to check a
change, and which decisions need a human.

**Never hand-edit `.claude/skills/`** — it is a generated mirror, and a change there is
lost at the next sync. `authoring-skills` owns how a skill is authored, mirrored, and
checked.

## Overview

A template for a TypeScript browser game. Nothing here is published to npm: to publish
means pushing a release tag or uploading a build to a game portal. Development and CI
run on Node >= 24, and pnpm 11 is the package manager, used through Corepack. It is a
pnpm workspace: `packages/core` holds the game rules, and `apps/web` builds them into a
static site with Vite 8 (see [Architecture](#architecture)).

## Quick reference

```sh
pnpm check:quick   # format check, lint, typecheck, tests — the everyday gate
pnpm check         # the full gate: the checks above with coverage, then the build
pnpm fix           # ESLint autofix, then Prettier
pnpm test          # tests only
pnpm test:coverage # tests with the coverage thresholds enforced
pnpm typecheck     # tsc -b over every workspace program
pnpm build         # build apps/web into apps/web/dist
pnpm dev           # Vite's dev server for apps/web; runs until stopped
pnpm agents:sync   # regenerate .claude/skills/ from .agents/skills/
pnpm agents:check  # fail when the two skill trees have drifted apart
pnpm repo:labels   # create/update GitHub labels from .github/labels.yml
pnpm bootstrap:e2e # run scripts/bootstrap.mjs end to end on a copy
pnpm bootstrap:check # the same, then install and run the full gate in the generated repository
```

Run one Vitest project with `pnpm exec vitest run --project core` (or `web`, `unit`,
`automation`), and one file with `pnpm exec vitest run <path>`. There are no per-package
test scripts.

`pnpm check:quick` is the full local source gate, and CI runs those source checks as
separate steps, so a green run here means those are green too. `lefthook`'s pre-commit
hook runs a staged-file-scoped version of the same tools — format applied rather than
merely checked, tests limited to the ones reachable from the staged files — before every
commit. Nothing — not a hook, not a workflow — defines a check of its own; they all call
these scripts.

Development and source checks stay on Node 24. Never relax `devEngines.runtime`'s
`onFail: error`.

## Validating a change

Run the narrowest check that can fail, then the gate. Reaching for `pnpm check` on every
edit is slow enough that it stops being run at all.

| What you changed                                                   | The narrowest check that can fail                    |
| ------------------------------------------------------------------ | ---------------------------------------------------- |
| A module under `packages/core/src/`                                | `pnpm exec vitest run --project core`                |
| A module under `apps/web/src/` other than `main.ts`                | `pnpm exec vitest run --project web`                 |
| `apps/web/src/main.ts`, `apps/web/index.html`, or the build output | `pnpm typecheck`, then `pnpm build`                  |
| A test                                                             | `pnpm exec vitest run <path>`                        |
| A script under `scripts/`                                          | `pnpm exec vitest run tests/<script>.test.ts`        |
| A skill under `.agents/skills/`                                    | `pnpm agents:sync && pnpm agents:check && pnpm test` |
| `package.json`, `pnpm-workspace.yaml`                              | `pnpm install`, then `pnpm check`                    |
| Markdown                                                           | `pnpm fix`                                           |

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
  DOM, no Node. It never imports from `apps/*`, so it runs unchanged without the
  renderer.
- `apps/web` is the Vite 8 game. It depends on the core package by its workspace name
  (`workspace:*`), and reaches core only through `packages/core/src/index.ts`.
- Anything that reads time, randomness, the device, or the network lives in `apps/web`
  and enters core as a plain value.
- `scripts/*.mjs` is repository automation that never ships.
- Tests live beside the layer they cover: `packages/core/test/`, `apps/web/test/`, and
  `tests/` for repository automation. Each layer has its own coverage floor in
  `vitest.config.ts`; `placing-tests` explains the split.

## Skills

Each skill owns one kind of change. Load the one whose subject you are working on; each
names its own boundary with its neighbours.

| Skill                        | Load it when you are working on                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `writing-typescript`         | a module under `packages/core/src/**` or `apps/web/src/**`                                |
| `designing-errors`           | an error type or an `ERR_*` code, in `packages/core/src/`, `apps/web/src/`, or `scripts/` |
| `writing-tests`              | the body of a test under `packages/core/test/`, `apps/web/test/`, or `tests/`             |
| `placing-tests`              | a new test file, a vitest project, or a coverage floor                                    |
| `writing-repo-scripts`       | a `.mjs` under `scripts/`                                                                 |
| `bootstrapping-the-template` | the bootstrap flow, its profiles, or `pnpm bootstrap:e2e`                                 |
| `authoring-skills`           | a skill under `.agents/skills/`                                                           |
| `changing-gates`             | a CI workflow, `lefthook.yml`, or a tool config                                           |
| `managing-dependencies`      | adding, bumping, or removing a package by hand (an open bot PR is `merge-dependabot`)     |
| `merge-dependabot`           | landing open Dependabot or Renovate pull requests                                         |
| `updating-docs`              | `README.md`, `CONTRIBUTING.md`, or `docs/`                                                |
| `triaging-issues`            | filing, labelling, or ranking a GitHub issue                                              |
| `shipping-issues`            | shipping explicitly requested issues through reviewed PRs and verified merges             |

## Security and human approval

- **Commit, push, pull request, and publish always need a human.** No file this
  repository ships blocks the dangerous spellings — `--no-verify`, a plain force-push,
  `npm`/`pnpm publish`, pushing a release tag, a portal upload, workflow dispatch —
  mechanically; this instruction is the rule itself, not a pattern enforcing it. An
  agent may still carry its own personal permission settings on top (a Claude Code
  session's own `~/.claude/settings.json`, for instance), but that is a choice made
  outside this repository, not something it ships or requires.
- Never read or write `.env*` (the `.example`, `.sample` and `.template` variants are
  fine) or anything under `secrets/`.
- Never write a credential into a tracked file — no registry auth token, no private key.
- Every pull request states whether a release is required, with `Release: none` or
  `Release: needed — <reason>` from `.github/PULL_REQUEST_TEMPLATE.md`;
  `releasing-builds` holds when each applies.
- `pnpm-lock.yaml` is generated by `pnpm install`, never hand-edited;
  `managing-dependencies` holds the reasoning.
- Never weaken a gate to make a run pass: no lowered coverage threshold in
  `vitest.config.ts`, no file added to `coverage.exclude` to move a number, no deleted
  security workflow, no removed `--frozen-lockfile`, no removed or relaxed ESLint rule
  or `pnpm-workspace.yaml` supply-chain setting, no `@ts-ignore`, no blanket
  `eslint-disable`, no skipped or deleted test. If a gate is wrong, say so and let a
  human decide.

That last rule stays here rather than moving into a skill, because the agent it has to
reach is looking at a red run and has classified its task as "make CI green" — not as
writing a test or adding a dependency, so neither skill fires. `placing-tests` explains
why there are three separate coverage floors and `managing-dependencies` explains what
each supply-chain setting closes off; the prohibition itself is here.

## Enforcement layers

The rules above are enforced by two layers, from mechanical to procedural. Each layer
holds only what belongs there — the rule itself lives in exactly one place, never copied
between layers:

| Layer                 | Fires on              | Applies to             | Holds                                                          |
| --------------------- | --------------------- | ---------------------- | -------------------------------------------------------------- |
| `lefthook` pre-commit | `git commit`          | every author, any tool | Formatting, a related-test run, and the one content rule below |
| This file             | read at session start | every agent            | Everything else — the reasons behind the rules above           |

This repository ships no declarative, tool-call-aware layer (a Claude Code
`permissions.deny` or equivalent) — every generated project starts without one, and an
agent has that protection only if it, or the human running it, has configured it
personally, outside this repository. The one rule that must hold regardless of which
tool or human is committing — a secret about to land in history — is instead the single
mechanical layer this repository does ship: `lefthook`'s pre-commit hook, which every
author goes through the same gate for.

Two consequences of that shape are worth naming rather than discovering: a shell command
that reads a secret path outside a commit (`cat .env`, `cp .env /tmp/x`) is invisible to
the hook, since it only inspects what is staged; and turning the Git hooks off through
the environment (`LEFTHOOK=0 git commit …`) is invisible to the hook it disables, with
nothing else in the repository watching for it. Neither is enforced anywhere. "Never
read or write `.env*` or anything under `secrets/`" and "never bypass the hooks" hold as
instructions in this file, not as blocks — reaching for either spelling is the thing
being ruled out, not the spelling that happens to be caught.

`scripts/lib/guard/` is the rule engine `scripts/check-staged.mjs` (the pre-commit
layer) uses to decide whether a staged path or its content is secret-shaped. That is the
whole of its scope, on purpose.

The hook deliberately does **not** try to stop a commit from deleting a workflow,
relaxing a config, or lowering a threshold. Those are judgement calls, and a judgement
call belongs in the pull request, where a reader can weigh it and disagree — a hook
cannot. A hook that blocks legitimate work teaches its author to reach for
`--no-verify`, and that flag disables the secret check along with everything else, so a
narrow hook that never fires on intended work protects more than a broad one that has to
be routed around. "Never weaken a gate to make a run pass" therefore holds as an
instruction in this file and as something a reviewer checks, not as a block.

Hand-editing `pnpm-lock.yaml` is the clearest example of a rule this repository accepts
as unenforced rather than mechanically blocked: a regenerated lockfile (`pnpm install`)
is an ordinary, expected commit, and a git diff cannot tell that apart from a hand edit
— only a layer that sees the actual tool call that produced the change could, and none
is enforced here. "The lockfile is generated, never hand-edited" holds as an
instruction, the same way the rules above it do.

A skill holds the reasoning behind a rule and the judgment a config cannot express; it
never holds a value a config owns, and never holds a prohibition an agent would meet
while its declared task is something else.

## Conventions

- All committed code, comments, configuration, and public documentation are in English.
  `authoring-skills` applies this to a skill's `description`.

- **A comment carries only what the code cannot** — a non-obvious why, a trap the next
  edit would spring, an external constraint. Default to none and keep the rest to a line
  or two. Restating the code, or narrating decision history, is what the code and git
  already do. TSDoc on the published surface is a contract and stays.

- Do what was asked; nothing more. Prefer editing an existing file to creating a new
  one, and do not add documentation files that were not requested.
- Note improvements you spot outside the current scope instead of making them.

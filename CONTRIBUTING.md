# Contributing

## Prerequisites

- Node.js 24 (`.node-version`). `devEngines.runtime.onFail` is an intentional hard
  error; do not weaken it.
- pnpm 11 through Corepack, which ships with Node.js. `package.json`'s `packageManager`
  pins the exact version, and pnpm is the only package manager used here.
- Git. `pnpm hooks:install` installs the pre-commit hook, and the hook is required: it
  carries the check that refuses a commit staging a secret.

```sh
node --version   # must report v24.x
corepack enable
corepack pnpm@11.18.0 install --frozen-lockfile
pnpm hooks:install
pnpm check
```

## Development Workflow

```sh
pnpm dev                # Vite's dev server for apps/web; runs until stopped
pnpm check:quick        # format check, lint, typecheck, tests: the everyday gate
pnpm check              # the full gate: pnpm check:source, pnpm budget, pnpm package:crazygames
pnpm check:source       # format check, lint, typecheck, tests with coverage, then the build
pnpm fix                # ESLint autofix, then Prettier
pnpm format:check       # fail on unformatted files
pnpm lint               # ESLint, including the determinism block for packages/core/src
pnpm typecheck          # tsc -b over every workspace program
pnpm test               # every test once
pnpm test:coverage      # tests with the coverage thresholds enforced
pnpm build              # build apps/web into apps/web/dist
pnpm budget             # fail when apps/web/dist is over the bundle budget
pnpm package:crazygames # the portal build and .package/<slug>-<version>-crazygames.zip
pnpm check:staged       # the pre-commit secret check, run by hand
pnpm e2e:browsers       # once per machine: install Playwright's Chromium
pnpm test:e2e           # the Chromium boot smoke test against a fresh build
```

`pnpm check` is the gate for a pull request; it mutates no tracked file. `pnpm test:e2e`
needs a browser, so it stays out of `pnpm check` and runs as its own CI job. It runs
`pnpm run build` first, overwriting `apps/web/dist`, then serves it with `vite preview`
on port 4173. Set `E2E_PORT` (an integer from 1 to 65535) to run it in two worktrees at
once.

Run one Vitest project with `pnpm exec vitest run --project core` (or `web`, `unit`,
`automation`), or one file with `pnpm exec vitest run <path>`. CI and the pre-commit
hook call these same scripts and define no check of their own.

A behavior change lands with its test in the same commit, and the test is written first:
a test that has never failed has not shown that it can.

<!-- template-only:start -->

### Bootstrap

`scripts/bootstrap.mjs` renames the template for a generated repository, once. Use
`pnpm bootstrap:e2e` for a fast transformation check. Before changing the template's
generation contract, run `pnpm bootstrap:check`: it generates a repository, installs its
frozen lockfile, and runs its full gate. A failed generated repository is retained in
the reported temporary directory.
<!-- template-only:end -->

### Dependency cooldown

The seven-day dependency cooldown in `pnpm-workspace.yaml` is fail-closed. If an urgent
security fix is younger than seven days, a maintainer may add the exact package and
version to `minimumReleaseAgeExclude` in the same reviewed PR as the lockfile update.
Record the advisory and why waiting is riskier, remove the exception after the version
ages out, and never use a broad package-only or wildcard exclusion.

## Worktrees

A linked worktree gives a second branch its own directory, so two changes can be in
progress at once. Create it outside this checkout:

```sh
git worktree add ../<directory> -b <type>/<issue>-<slug> origin/main
cd ../<directory>
pnpm install --frozen-lockfile
pnpm check
```

- The Git hooks are installed once, in the primary checkout, and run in every linked
  worktree.
- Dependencies are not shared: each worktree runs its own
  `pnpm install --frozen-lockfile`, and its build and coverage output stay inside it.
- Never copy `.env*` files or personal settings into a worktree.
- `pnpm dev` in a second worktree finds Vite's default port taken and moves to the next
  free one; read the URL it prints.
- Remove a worktree with `git worktree remove <directory>` once its branch has merged
  and `git status` there is clean.

## Pull Request Process

1. Create a branch from `main`. Changes reach `main` only through a pull request.
2. Make the change with its tests, and update `README.md` and the affected docs when
   something a user observes moved.
3. Run `pnpm check` on the committed tree. `pnpm fix` applies formatting; commit its
   result before judging the gate.
4. Open the pull request with the template: a Summary, exactly one `Release:` line
   (`Release: none` or `Release: needed — <what the player sees>`), exactly one
   `Rules version:` line (`unchanged` or `bumped to <n>`) when the diff touches
   `packages/core`, a Test Plan naming the commands you ran, and the Checklist.

Commits and the pull request title follow Conventional Commits,
`<type>(<optional-scope>): <summary>`. The accepted types are the `types:` input of
[the PR title workflow](.github/workflows/check-pr-title.yml).

### Releasing

A release is a GitHub Release carrying the CrazyGames zip, built by
[the release workflow](.github/workflows/release.yml):

1. Bump `version` in `apps/web/package.json` and move the `## [Unreleased]` lines of
   `CHANGELOG.md` into a section for that version, in a pull request.
2. After it merges, tag the merge commit `vX.Y.Z` (the new version) and push the tag.
3. The workflow refuses a tag that is not `vMAJOR.MINOR.PATCH`, does not match the
   version, or is not on the default branch; otherwise it runs `pnpm check` and attaches
   `.package/<slug>-<version>-crazygames.zip` to the release for that tag.

Uploading the zip to CrazyGames stays a manual step in its developer portal.

With Claude Code, `CLAUDE.md` is the project guide and the procedures are the skills
under `.claude/skills/`: `tdd`, `smart-commit`, `create-pr`, and `running-the-app` for a
change made by hand, `shipping-issues` to take an issue through to a merged pull
request.

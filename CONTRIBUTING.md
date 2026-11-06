# Contributing

## Setup

Use Node.js 24 and pnpm 11 through Corepack:

```sh
node --version
corepack enable
corepack pnpm@11.18.0 install --frozen-lockfile
pnpm hooks:install
pnpm check
```

The first command must report Node 24.x. `devEngines.runtime.onFail` is an intentional
hard error; do not weaken it.

Useful focused commands are `pnpm check:quick`, `pnpm test`, `pnpm test:coverage`, and
`pnpm build`.

<!-- template-only:start -->

## Bootstrap

`scripts/bootstrap.mjs` renames the template for a generated repository, once. Use
`pnpm bootstrap:e2e` for a fast transformation check. Before changing the template's
generation contract, run `pnpm bootstrap:check`: it generates a repository, installs its
frozen lockfile, and runs its full gate. A failed generated repository is retained in
the reported temporary directory.
<!-- template-only:end -->

## Dependency cooldown

The seven-day dependency cooldown in `pnpm-workspace.yaml` is fail-closed. If an urgent
security fix is younger than seven days, a maintainer may add the exact package and
version to `minimumReleaseAgeExclude` in the same reviewed PR as the lockfile update.
Record the advisory and why waiting is riskier, remove the exception after the version
ages out, and never use a broad package-only or wildcard exclusion.

## Pull requests

Create a feature branch, keep commits focused, and use a Conventional Commit PR title.
Update the tests and documentation with the change, fill in the release line of the PR
template, and run `pnpm check` before requesting review.

# my-game

[![CI](https://github.com/your-name/my-game/actions/workflows/ci.yml/badge.svg)](https://github.com/your-name/my-game/actions/workflows/ci.yml)

A short description.

## Quickstart

Requires Node.js 24 and pnpm 11 through Corepack (CONTRIBUTING.md's "Prerequisites" has
the details).

```sh
corepack enable
corepack pnpm@11.18.0 install --frozen-lockfile
pnpm hooks:install
pnpm dev
```

`pnpm dev` starts Vite's dev server for `apps/web` and runs until stopped; open the URL
it prints (<http://localhost:5173> unless that port is taken). `pnpm build` writes the
static site to `apps/web/dist`. Every asset URL in it is relative, so the directory can
be served from any path.

<!-- template-only:start -->

## Use this template

Create a repository with GitHub's **Use this template** button, then run the interactive
bootstrap before installing dependencies:

```sh
node scripts/bootstrap.mjs
```

Answer the prompts for the game slug, display title, author, GitHub user, license, and
description. For automation, pass the slug together with the `--title`, `--author`,
`--github-user`, and `--license` flags. Use `--dry-run` to preview changes and `--help`
for the complete command syntax. Bootstrap removes this section from the generated
repository.
<!-- template-only:end -->

## Architecture

```text
packages/core/   # the game rules: deterministic, no dependencies, no DOM, no Node
apps/web/        # the browser entry; Vite builds it into apps/web/dist
scripts/         # repository automation, never shipped
tests/           # repository-level tests
```

It is a pnpm workspace. `apps/web` depends on `packages/core` by its workspace name and
imports it only through `packages/core/src/index.ts`. Anything that reads time,
randomness, the device, or the network lives in `apps/web` and enters core as a plain
value. `CLAUDE.md` holds the layer rules in full.

## Development

```sh
pnpm check:quick   # format check, lint, typecheck, tests: the everyday gate
pnpm check         # the full gate: the checks above with coverage, then the build
pnpm fix           # ESLint autofix, then Prettier
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the prerequisites, the workflow, worktrees,
and the pull request process.

## License

[MIT](LICENSE) © Your Name

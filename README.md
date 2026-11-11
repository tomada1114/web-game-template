# my-game

[![CI](https://github.com/your-name/my-game/actions/workflows/ci.yml/badge.svg)](https://github.com/your-name/my-game/actions/workflows/ci.yml)

A short description.

<!-- template-only:start -->

## Use this template

This is a GitHub template for small deterministic 2D browser games in TypeScript (Vite
8, Phaser 4, the CrazyGames HTML5 SDK v3), built mostly by coding agents. A repository
cut from it starts with a playable sample game; once CLAUDE.md's `## Product` is
written, every gate is green (the Product-section test fails until then).

Create a repository with GitHub's **Use this template** button, then run the interactive
bootstrap before installing dependencies:

```sh
node scripts/bootstrap.mjs
```

Answer the prompts for the game slug, display title, author, GitHub user, license, and
description. For automation, pass the slug and the flags instead:

```sh
node scripts/bootstrap.mjs <slug> --title "<Game Name>" --author "<Author>" \
  --github-user <user> --license MIT
```

Use `--dry-run` to preview changes and `--help` for the complete command syntax.
Bootstrap removes this section from the generated repository; the `starting-an-app`
skill covers the work that follows.

<!-- template-only:end -->

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
it prints (<http://localhost:5173> unless that port is taken). The page shows the sample
game's title screen: **Play daily** starts today's board, **Practice** a random one.
`pnpm build` writes the static site to `apps/web/dist`. Every asset URL in it is
relative, so the directory can be served from any path.

## Architecture

```text
packages/core/   # the game rules: deterministic, no dependencies, no DOM, no Node
apps/web/        # the Phaser game; Vite builds it into apps/web/dist
scripts/         # repository automation, never shipped
tests/           # repository-level tests; tests/e2e/ holds the browser boot smoke
```

It is a pnpm workspace. `apps/web` depends on `packages/core` by its workspace name and
imports it only through `packages/core/src/index.ts`. `CLAUDE.md` holds the layer rules
in full.

Game rules are deterministic: the same seed and the same moves give the same state and
score on every JavaScript engine. That is why core reads nothing beyond its arguments.
Anything that reads time, randomness, the device, or the network lives in `apps/web` and
enters core as a plain value.

## Development

```sh
pnpm check:quick         # format check, lint, typecheck, tests: the everyday gate
pnpm check               # the full gate: coverage, build, budget, and the CrazyGames zip
pnpm fix                 # ESLint autofix, then Prettier
pnpm package:crazygames  # the portal build, zipped into .package/<slug>-<version>-crazygames.zip
```

The zip has `index.html` at its root. Uploading it to CrazyGames is a manual step in the
CrazyGames developer portal; nothing in this repository uploads it.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the prerequisites, the workflow, worktrees,
and the pull request process. The procedures and design decisions an agent follows are
the skills under [`.claude/skills/`](.claude/skills/), such as
[`writing-game-core`](.claude/skills/writing-game-core/SKILL.md),
[`building-scenes`](.claude/skills/building-scenes/SKILL.md),
[`integrating-portals`](.claude/skills/integrating-portals/SKILL.md), and
[`releasing-builds`](.claude/skills/releasing-builds/SKILL.md).

## License

[MIT](LICENSE) © Your Name

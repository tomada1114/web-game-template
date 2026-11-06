# my-game

[![CI](https://github.com/your-name/my-game/actions/workflows/ci.yml/badge.svg)](https://github.com/your-name/my-game/actions/workflows/ci.yml)

A short description.

## Install

```sh
pnpm add my-game
```

Requires Node.js 24 or newer. The package ships ESM only. CommonJS consumers need a
Node.js version with unflagged `require(esm)` support (20.19+, 22.12+, or 24+).

## Quick start

```ts
import { normalizeIdentifier } from "my-game";

console.log(normalizeIdentifier("Hello World"));
// => "hello-world"
```

All public symbols are named exports from the package root. Deep imports are private and
blocked by the package export map.

## API

- `normalizeIdentifier(input, options?)` creates a URL- and filename-safe ASCII
  identifier using `-`, `_`, `.`, or `~` as its separator.
- `withTimeout(operation, options)` runs an abortable operation with a deadline.
- `InvalidInputError` and `TimeoutError` expose stable error codes.

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

## Development

```sh
corepack pnpm@11.18.0 install --frozen-lockfile
pnpm hooks:install
pnpm check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the complete workflow.

## License

[MIT](LICENSE) © Your Name

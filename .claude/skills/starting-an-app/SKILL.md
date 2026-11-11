---
name: starting-an-app
description: >
  Use in a repository freshly cut from this game template, or when a kickoff hands one
  over: running the bootstrap (slug, --title, --author, --github-user, --license,
  --description), ERR_ALREADY_BOOTSTRAPPED, tests/product-section.test.ts failing while
  CLAUDE.md's ## Product still has TODO: lines, the first design lock and tokens,
  removing the sample game in packages/core/src/sample/ and the scenes' sample wiring,
  or the human-only setup: branch ruleset, repository security settings, CrazyGames
  developer account.
---

# Starting an App

**Owns:** the order of the first work in a new game repository, when and how the sample
game goes, and what only a human can do. **Does not own:** the rules and the golden
tests (`writing-game-core`); visual values and the lock (`designing-ui`); the scenes
(`building-scenes`); issue vocabulary (`triaging-issues`); shipping an issue
(`shipping-issues`); the bootstrap script's own internals, which the template documents
and a generated repository no longer carries.

## Order

Do these in order. Each step leaves the repository in a state the next one assumes.

1. **Bootstrap**, once, in the freshly cut repository and before `pnpm install`:

   ```sh
   node scripts/bootstrap.mjs <slug> --title "<Display Name>" --author "<Author>" \
     --github-user <user> --license <SPDX id> --description "<one line>"
   ```

   Without arguments it prompts for the same six values; it asks for no email. It
   renames the template's package scope, zip name, and daily salt to the slug; the
   `index.html` title, the Title scene, and the share text to the display name (both
   through `GAME_SLUG` and `GAME_TITLE` in `apps/web/src/game-info.ts`); and the README
   and LICENSE holders. It keeps the sample game, writes `.template-origin` (the
   template URL, the commit and tree it was cut from or `unknown`; it marks the
   repository as generated and stays committed), leaves `CLAUDE.md`'s `## Product` as
   exactly these placeholder lines (the template carries them), and removes itself and
   its tests. Because it removes its own script, the refusal guards only a rerun of a
   copy of the bootstrap script brought back: while `.template-origin` exists that run
   fails with `ERR_ALREADY_BOOTSTRAPPED` and changes nothing.

   ```
   TODO: What this game is, in one paragraph.
   TODO: Who it is for, and the core interaction.
   TODO: Non-goals, copied verbatim from docs/product/requirements.md.
   TODO: Where decisions live: docs/product/requirements.md and the skills.
   ```

2. **`pnpm install`**, then `pnpm check:quick`. Expect exactly one failure:
   `tests/product-section.test.ts`, which reads `.template-origin` and fails while any
   `TODO:` remains in `## Product`. Any other failure is a real problem to fix before
   going on.

3. **Write `## Product`** in `CLAUDE.md` from the game's signed-off requirements,
   replacing every `TODO:` line. `pnpm check:quick` is now green.

4. **Design lock and tokens.** The game's own visual design stage replaces the sample's
   lock, `apps/web/src/theme/tokens.ts`, and `docs/design/design-direction.md`.
   **REQUIRED:** `designing-ui`.

5. **Replace the sample** with the game's first rules — see below.

6. **Human-only steps** — see below.

Issues for the game follow **REQUIRED:** `triaging-issues`, and are shipped with
**BACKGROUND:** `shipping-issues`.

## Removing the sample

The first game issue replaces the sample — not earlier, because the sample keeps every
gate meaningful while the Product section and the design land, and not later, because
sample rules left in a shipped game are a bug.

What goes, in that one issue:

- `packages/core/src/sample/` and the tests and golden values that cover it.
- The scenes' sample wiring: the board drawing, the tile-to-glyph map and view model,
  and the sample's copy ("Make every tile the same", the how-to-play line).
- The share text's score scale (`<score>/20`, a bar of `floor(score / 2)` filled glyphs)
  and the best-score range when the new score differs from 1–20.
- `docs/product/` pages that still describe the sample, replaced by the game's own.

What stays:

- The PRNG, `seedFrom`, `dailySeed`, replay, `RULES_VERSION`, and the error classes.
- The Boot → Title → Play → Result skeleton, the platform adapter, storage, and the
  packaging scripts.
- The test hooks. The boot smoke test needs `body[data-ready="true"]`, a Practice path,
  `body[data-scene="play"]`, and a `#debug-moves` count that one Enter moves from 0
  to 1. Keep them, or change the smoke test in the same PR.

Before the game's first release, that PR deletes the sample goldens, writes the new
ones, and keeps `RULES_VERSION = 1`; a bump is needed only once a release has shipped.
Its body says `Rules version: unchanged`. **REQUIRED:** `writing-game-core` for the core
and its tests; **REQUIRED:** `releasing-builds` for the PR lines.

## Human-only steps

Commits, branch pushes and pull requests are within an authorized task's scope and need
no separate request (`CLAUDE.md` § Security and human approval). These stay the owner's;
prepare the concrete proposal, then ask, and list them for the owner when the repository
is handed over:

- Pushing a release tag (`releasing-builds`) and uploading a build to a portal.
- A new dependency.
- A branch ruleset on the default branch that requires pull requests and the CI checks.
  Only a human applies it.
- The repository's security settings on GitHub. Only a human changes them.
- A CrazyGames developer account, and at submission the decision whether Progress Save
  is on. **BACKGROUND:** `integrating-portals`.

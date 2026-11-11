---
name: releasing-builds
description: >
  Use when writing a pull request body's `Release: none` or `Release: needed — <reason>`
  line, or its `Rules version: unchanged` or `Rules version: bumped to <n>` line;
  editing .github/PULL_REQUEST_TEMPLATE.md; adding a line under CHANGELOG.md's ##
  [Unreleased]; bumping the version in apps/web/package.json; deciding whether a change
  needs a release; tagging and pushing vX.Y.Z; a failed .github/workflows/release.yml
  run; or uploading the CrazyGames zip from a GitHub Release.
---

# Releasing Builds

**Owns:** what every pull request states about its release and rules-version
consequences, the game's version and `CHANGELOG.md`, and how a release is cut. **Does
not own:** whether a change alters game results — the golden tests and `RULES_VERSION`
(`writing-game-core`); what the zip contains and how it is checked
(`integrating-portals`); editing the workflow file itself (`changing-gates`); the
approval that commit, push, and tag push need (`CLAUDE.md`).

A game is not a package: a release is a zip attached to a GitHub Release and uploaded to
a portal by hand. Nothing is published to npm.

## PR body lines

Every pull request body carries exactly one of:

```
Release: none
Release: needed — <reason>
```

and, when the diff touches `packages/core`, exactly one of:

```
Rules version: unchanged
Rules version: bumped to <n>
```

`.github/PULL_REQUEST_TEMPLATE.md` holds both lines. No check reads them; the reviewer
does. A missing line is an incomplete PR, not a "none" — ask for it before approving.

- `Release: needed` when a player can observe the change in the built game: rules,
  scoring, a screen, copy, input, platform behaviour, a fix to any of these, or a
  runtime dependency that ships in the bundle. The reason names what the player sees.
- `Release: none` for tests, CI, scripts, skills, documentation, and devDependency bumps
  — anything that leaves the zip's behaviour unchanged.
- `Rules version: bumped to <n>` exactly when a golden value moved and `RULES_VERSION`
  went up with it. Such a change alters what players get from the same seed, so it is
  always `Release: needed` as well. **REQUIRED:** `writing-game-core` for the bump rule.
- `Rules version: unchanged` when core changed and every golden value stayed as it was —
  a refactor, a test, a type — and also before the first release, when a game replaces
  the sample goldens and keeps `RULES_VERSION = 1`.
- Every `Release: needed` change adds one line under `## [Unreleased]` in `CHANGELOG.md`
  in the same PR, written as what a player notices, never as which files changed.

## Versioning

- The version lives in `apps/web/package.json`. The root `package.json` is private and
  carries no release version. The zip name and the tag both read it.
- The version is `X.Y.Z`, and the tag is `v` plus that version; the release workflow
  refuses a tag that does not match `apps/web/package.json`.
- Pick the bump from what a player sees: a fix is a patch; new or changed behaviour is a
  minor; a release that bumps `RULES_VERSION`, which makes earlier scores and replays
  incomparable, is a major — a minor while the version is below `1.0.0`.

## Cutting a release

1. Open a release PR: bump the version in `apps/web/package.json`, move the lines under
   `## [Unreleased]` into a new `## [X.Y.Z] - YYYY-MM-DD` section, and leave
   `## [Unreleased]` in place, empty. Its body says `Release: needed — release X.Y.Z`.
2. After it merges, tag the merge commit `vX.Y.Z` and push the tag. Pushing is a human
   step (`CLAUDE.md`).
3. `.github/workflows/release.yml` runs on the `v*.*.*` tag: a frozen-lockfile install,
   then `pnpm check` once — which already produces the zip through `package:crazygames`
   — then `gh release create "$TAG" .package/*.zip --generate-notes`, with no second
   build. Its top-level `permissions` stay `{}` or `contents: read`; `contents: write`
   is granted at job level.
4. Upload the zip from the GitHub Release to CrazyGames in its developer portal. That is
   manual; nothing in the repository talks to the portal.

A pushed tag is never moved or re-pushed. If the workflow fails, fix the cause on the
default branch through a PR and release the next patch version.
